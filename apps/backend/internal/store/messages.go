package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"ctracking/backend/internal/messages"

	"github.com/jackc/pgx/v5"
)

// AdminMessage is a message plus its bookkeeping timestamps (super-admin views).
type AdminMessage struct {
	messages.Message
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	ResponseCount int64     `json:"response_count"`
}

const messageCols = `id, kind, active, start_at, end_at, audience, repeat_days, anonymous, content, fields, created_at, updated_at,
	(SELECT count(*) FROM message_responses r WHERE r.message_id = messages.id)`

func scanMessage(row pgx.Row) (AdminMessage, error) {
	var m AdminMessage
	var audience, content, fields []byte
	err := row.Scan(&m.ID, &m.Kind, &m.Active, &m.Start, &m.End, &audience, &m.RepeatDays,
		&m.Anonymous, &content, &fields, &m.CreatedAt, &m.UpdatedAt, &m.ResponseCount)
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal(audience, &m.Audience); err != nil {
		return m, err
	}
	if err := json.Unmarshal(content, &m.Content); err != nil {
		return m, err
	}
	return m, json.Unmarshal(fields, &m.Fields)
}

// ListMessages returns every message, newest first.
func (s *Store) ListMessages(ctx context.Context) ([]AdminMessage, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+messageCols+` FROM messages ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminMessage{}
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetMessage returns one message, or ErrNotFound.
func (s *Store) GetMessage(ctx context.Context, id string) (AdminMessage, error) {
	m, err := scanMessage(s.pool.QueryRow(ctx, `SELECT `+messageCols+` FROM messages WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

func messageJSON(m *messages.Message) (audience, content, fields []byte, err error) {
	if audience, err = json.Marshal(m.Audience); err != nil {
		return
	}
	if content, err = json.Marshal(m.Content); err != nil {
		return
	}
	if m.Fields == nil {
		m.Fields = []messages.Field{}
	}
	fields, err = json.Marshal(m.Fields)
	return
}

// CreateMessage inserts a new message; ErrConflict if the id is taken.
func (s *Store) CreateMessage(ctx context.Context, m *messages.Message) error {
	audience, content, fields, err := messageJSON(m)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO messages (id, kind, active, start_at, end_at, audience, repeat_days, anonymous, content, fields)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		m.ID, m.Kind, m.Active, m.Start, m.End, audience, m.RepeatDays, m.IsAnonymous(), content, fields)
	if isUniqueViolation(err) {
		return ErrConflict
	}
	return err
}

// UpdateMessage replaces a message's editable fields (the id is fixed);
// ErrNotFound if it doesn't exist.
func (s *Store) UpdateMessage(ctx context.Context, m *messages.Message) error {
	audience, content, fields, err := messageJSON(m)
	if err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx,
		`UPDATE messages SET kind = $2, active = $3, start_at = $4, end_at = $5, audience = $6,
		        repeat_days = $7, anonymous = $8, content = $9, fields = $10, updated_at = now()
		  WHERE id = $1`,
		m.ID, m.Kind, m.Active, m.Start, m.End, audience, m.RepeatDays, m.IsAnonymous(), content, fields)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteMessage removes a message and its survey answers (its analytics events
// are kept for history); ErrNotFound if it doesn't exist.
func (s *Store) DeleteMessage(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM messages WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ActiveMessages returns the messages switched on, for the desktop endpoint.
func (s *Store) ActiveMessages(ctx context.Context) ([]messages.Message, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+messageCols+` FROM messages WHERE active`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []messages.Message
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m.Message)
	}
	return out, rows.Err()
}

// MessageAudience returns the membership roles and business kinds of a user,
// used to target in-app messages.
func (s *Store) MessageAudience(ctx context.Context, userID string) (roles, kinds []string, err error) {
	rows, err := s.pool.Query(ctx,
		`SELECT DISTINCT m.role, b.kind FROM memberships m JOIN businesses b ON b.id = m.business_id
		  WHERE m.user_id = $1`, userID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var role, kind string
		if err := rows.Scan(&role, &kind); err != nil {
			return nil, nil, err
		}
		roles = append(roles, role)
		kinds = append(kinds, kind)
	}
	return roles, kinds, rows.Err()
}

// AnsweredMessageIDs lists messages the user has answered under their name
// (anonymous answers can't be traced back, so the client remembers those).
func (s *Store) AnsweredMessageIDs(ctx context.Context, userID string) (map[string]bool, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT message_id FROM message_responses WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// SaveMessageResponse stores a survey answer. userID nil = anonymous: the time is
// kept to the day only, so an answer can't be matched to a user's popup events by
// timestamp. A named user's repeat answer is ignored (first one wins).
func (s *Store) SaveMessageResponse(ctx context.Context, messageID string, userID *string,
	answers map[string]any, appVersion, platform, locale string) error {
	raw, err := json.Marshal(answers)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO message_responses (message_id, user_id, answers, app_version, platform, locale, created_at)
		 VALUES ($1, $2::uuid, $3, $4, $5, $6, CASE WHEN $2::uuid IS NULL THEN date_trunc('day', now()) ELSE now() END)
		 ON CONFLICT (message_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
		messageID, userID, raw, appVersion, platform, locale)
	return err
}

// MessageEvent is one popup analytics event.
type MessageEvent struct {
	MessageID, Event, Actor, Role, Platform, Locale, AppVersion string
}

// RecordMessageEvent stores an analytics event; 'delivered' counts once per
// actor per day.
func (s *Store) RecordMessageEvent(ctx context.Context, e MessageEvent) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO message_events (message_id, event, actor, role, platform, locale, app_version)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (message_id, actor, day) WHERE event = 'delivered' DO NOTHING`,
		e.MessageID, e.Event, e.Actor, e.Role, e.Platform, e.Locale, e.AppVersion)
	return err
}

// EventCount is a total and a unique-user count for one event.
type EventCount struct {
	Total  int64 `json:"total"`
	Unique int64 `json:"unique"`
}

// MessageEventTotals returns, per message id, the counts for each event
// (includes the bundled "whatsnew-<version>" ids).
func (s *Store) MessageEventTotals(ctx context.Context) (map[string]map[string]EventCount, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT message_id, event, count(*), count(DISTINCT actor) FROM message_events GROUP BY 1, 2`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]EventCount{}
	for rows.Next() {
		var id, ev string
		var c EventCount
		if err := rows.Scan(&id, &ev, &c.Total, &c.Unique); err != nil {
			return nil, err
		}
		if out[id] == nil {
			out[id] = map[string]EventCount{}
		}
		out[id][ev] = c
	}
	return out, rows.Err()
}

// DailyEventCount is unique users per event for one day.
type DailyEventCount struct {
	Day    string `json:"day"`
	Event  string `json:"event"`
	Unique int64  `json:"unique"`
}

// MessageDaily returns unique users per event per day over the last `days` days.
func (s *Store) MessageDaily(ctx context.Context, id string, days int) ([]DailyEventCount, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT to_char(day, 'YYYY-MM-DD'), event, count(DISTINCT actor) FROM message_events
		  WHERE message_id = $1 AND day > CURRENT_DATE - $2::int GROUP BY 1, 2 ORDER BY 1`, id, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DailyEventCount{}
	for rows.Next() {
		var d DailyEventCount
		if err := rows.Scan(&d.Day, &d.Event, &d.Unique); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// BreakdownCount is unique users per event for one value of a dimension.
type BreakdownCount struct {
	Dim    string `json:"dim"`
	Value  string `json:"value"`
	Event  string `json:"event"`
	Unique int64  `json:"unique"`
}

// MessageBreakdown returns unique users per event by locale, platform, app
// version and role.
func (s *Store) MessageBreakdown(ctx context.Context, id string) ([]BreakdownCount, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT 'locale', locale, event, count(DISTINCT actor) FROM message_events WHERE message_id = $1 GROUP BY 2, 3
		UNION ALL
		SELECT 'platform', platform, event, count(DISTINCT actor) FROM message_events WHERE message_id = $1 GROUP BY 2, 3
		UNION ALL
		SELECT 'version', app_version, event, count(DISTINCT actor) FROM message_events WHERE message_id = $1 GROUP BY 2, 3
		UNION ALL
		SELECT 'role', role, event, count(DISTINCT actor) FROM message_events WHERE message_id = $1 GROUP BY 2, 3`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BreakdownCount{}
	for rows.Next() {
		var b BreakdownCount
		if err := rows.Scan(&b.Dim, &b.Value, &b.Event, &b.Unique); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// MessageResponse is one stored survey answer.
type MessageResponse struct {
	Answers    map[string]any `json:"answers"`
	UserID     *string        `json:"user_id"`
	UserName   *string        `json:"user_name"`  // named surveys only
	UserLogin  *string        `json:"user_login"` // email or username
	AppVersion string         `json:"app_version"`
	Platform   string         `json:"platform"`
	Locale     string         `json:"locale"`
	CreatedAt  time.Time      `json:"created_at"`
}

// MessageResponses returns a survey's answers, newest first.
func (s *Store) MessageResponses(ctx context.Context, id string) ([]MessageResponse, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT r.answers, r.user_id::text, u.display_name, COALESCE(u.email, u.username),
		        r.app_version, r.platform, r.locale, r.created_at
		   FROM message_responses r LEFT JOIN users u ON u.id = r.user_id
		  WHERE r.message_id = $1 ORDER BY r.created_at DESC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MessageResponse{}
	for rows.Next() {
		var r MessageResponse
		var raw []byte
		if err := rows.Scan(&raw, &r.UserID, &r.UserName, &r.UserLogin, &r.AppVersion, &r.Platform, &r.Locale, &r.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &r.Answers); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// AdminUser is a user as shown in the message audience picker.
type AdminUser struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

// FindUsers returns up to 20 users whose name, username or email contains q
// (case-insensitive), or the users with the given ids when ids is non-empty.
func (s *Store) FindUsers(ctx context.Context, q string, ids []string) ([]AdminUser, error) {
	sql := `SELECT id, display_name, COALESCE(username, ''), COALESCE(email, '') FROM users
	         WHERE display_name ILIKE '%' || $1 || '%' OR username ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%'
	         ORDER BY display_name LIMIT 20`
	arg := any(q)
	if len(ids) > 0 {
		sql = `SELECT id, display_name, COALESCE(username, ''), COALESCE(email, '') FROM users
		        WHERE id::text = ANY($1) ORDER BY display_name`
		arg = ids
	}
	rows, err := s.pool.Query(ctx, sql, arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminUser{}
	for rows.Next() {
		var u AdminUser
		if err := rows.Scan(&u.ID, &u.Name, &u.Username, &u.Email); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}
