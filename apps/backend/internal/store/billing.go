package store

import (
	"context"
	"errors"
	"time"

	"ctracking/backend/internal/billing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Billing (tickets 152, 159): projects, tasks, member rates, time entries and the
// invoices members raise against the workspace. Every query is scoped by
// business_id — handlers check membership/role first, the store never trusts an id
// from another workspace.

// ErrLocked is returned when time that is already on an invoice would be changed.
var ErrLocked = errors.New("locked")

// ErrInUse is returned when a row can't be deleted because others reference it.
var ErrInUse = errors.New("in use")

// isFKViolation: a delete blocked by a referencing row. Postgres 16 reports ON
// DELETE RESTRICT as 23503 (foreign_key_violation), 18 as 23001 (restrict_violation).
func isFKViolation(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && (pg.Code == "23503" || pg.Code == "23001")
}

// MemberRole returns the caller's role in a business ("" when not a member).
func (s *Store) MemberRole(ctx context.Context, userID, businessID string) (string, error) {
	var role string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM memberships WHERE user_id = $1 AND business_id = $2`, userID, businessID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return role, err
}

// ---------- settings ----------

type BillingSettings struct {
	Currency       string `json:"currency"`
	BillingDetails string `json:"billing_details"`
	BusinessName   string `json:"business_name"`
}

func (s *Store) GetBillingSettings(ctx context.Context, bizID string) (BillingSettings, error) {
	var b BillingSettings
	err := s.pool.QueryRow(ctx, `SELECT currency, billing_details, name FROM businesses WHERE id = $1`, bizID).
		Scan(&b.Currency, &b.BillingDetails, &b.BusinessName)
	return b, err
}

func (s *Store) UpdateBillingSettings(ctx context.Context, bizID, currency, details string) error {
	_, err := s.pool.Exec(ctx, `UPDATE businesses SET currency = $2, billing_details = $3 WHERE id = $1`,
		bizID, currency, details)
	return err
}

// ---------- members + rates ----------

type BillingMember struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Login     string `json:"login"`
	Role      string `json:"role"`
	RateCents *int   `json:"rate_cents"` // rate in force today, nil = none set
}

type MemberRate struct {
	ID            int64  `json:"id"`
	UserID        string `json:"user_id"`
	RateCents     int    `json:"rate_cents"`
	EffectiveFrom string `json:"effective_from"`
}

func (s *Store) BillingMembers(ctx context.Context, bizID, today string) ([]BillingMember, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT u.id, u.display_name, COALESCE(u.username, u.email, ''), m.role,
		        (SELECT r.rate_cents FROM member_rates r
		          WHERE r.business_id = m.business_id AND r.user_id = u.id AND r.effective_from <= $2::date
		          ORDER BY r.effective_from DESC LIMIT 1)
		   FROM memberships m JOIN users u ON u.id = m.user_id
		  WHERE m.business_id = $1
		  ORDER BY m.role DESC, u.display_name`, bizID, today)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (BillingMember, error) {
		var m BillingMember
		err := r.Scan(&m.ID, &m.Name, &m.Login, &m.Role, &m.RateCents)
		return m, err
	})
}

func (s *Store) ListRates(ctx context.Context, bizID string) ([]MemberRate, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, rate_cents, effective_from::text FROM member_rates
		  WHERE business_id = $1 ORDER BY user_id, effective_from DESC`, bizID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (MemberRate, error) {
		var m MemberRate
		err := r.Scan(&m.ID, &m.UserID, &m.RateCents, &m.EffectiveFrom)
		return m, err
	})
}

// SetRate records a member's rate from a date (replacing one set for the same date).
func (s *Store) SetRate(ctx context.Context, bizID, userID string, cents int, from string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO member_rates (business_id, user_id, rate_cents, effective_from)
		 SELECT $1, $2, $3, $4::date WHERE EXISTS (SELECT 1 FROM memberships WHERE business_id = $1 AND user_id = $2)
		 ON CONFLICT (business_id, user_id, effective_from) DO UPDATE SET rate_cents = EXCLUDED.rate_cents`,
		bizID, userID, cents, from)
	return err
}

func (s *Store) DeleteRate(ctx context.Context, bizID string, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM member_rates WHERE business_id = $1 AND id = $2`, bizID, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *Store) rateHistory(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, bizID string) ([]billing.Rate, error) {
	rows, err := q.Query(ctx,
		`SELECT user_id, rate_cents, effective_from::text FROM member_rates WHERE business_id = $1`, bizID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (billing.Rate, error) {
		var x billing.Rate
		err := r.Scan(&x.UserID, &x.RateCents, &x.EffectiveFrom)
		return x, err
	})
}

// ---------- a member's own billing view (ticket 159) ----------

// MemberBilling is what a member needs to raise their own invoice: their rate in
// force today, the workspace currency, their own "from" block and the workspace's
// "bill to" block.
type MemberBilling struct {
	Currency        string `json:"currency"`
	RateCents       *int   `json:"rate_cents"` // rate in force today, nil = none set yet
	MyName          string `json:"my_name"`
	MyDetails       string `json:"my_details"`
	BusinessName    string `json:"business_name"`
	BusinessDetails string `json:"business_details"`
}

func (s *Store) MemberBilling(ctx context.Context, bizID, userID, today string) (MemberBilling, error) {
	var m MemberBilling
	err := s.pool.QueryRow(ctx,
		`SELECT b.currency, b.name, b.billing_details, u.display_name, ms.billing_details,
		        (SELECT r.rate_cents FROM member_rates r
		          WHERE r.business_id = $1 AND r.user_id = $2 AND r.effective_from <= $3::date
		          ORDER BY r.effective_from DESC LIMIT 1)
		   FROM memberships ms JOIN businesses b ON b.id = ms.business_id JOIN users u ON u.id = ms.user_id
		  WHERE ms.business_id = $1 AND ms.user_id = $2`, bizID, userID, today).
		Scan(&m.Currency, &m.BusinessName, &m.BusinessDetails, &m.MyName, &m.MyDetails, &m.RateCents)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

// SetMemberBillingDetails stores the member's own "from" block for this workspace.
func (s *Store) SetMemberBillingDetails(ctx context.Context, bizID, userID, details string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE memberships SET billing_details = $3 WHERE business_id = $1 AND user_id = $2`, bizID, userID, details)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func deleteScoped(ctx context.Context, s *Store, sql, bizID, id string) error {
	tag, err := s.pool.Exec(ctx, sql, bizID, id)
	if isFKViolation(err) {
		return ErrInUse
	}
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// ---------- projects ----------

// A project is open to the whole workspace unless Restricted is set, in which case
// only MemberIDs (plus the owner) may work on it (ticket 163).
type Project struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Billable   bool     `json:"billable"`
	RateCents  *int     `json:"rate_cents"`
	Archived   bool     `json:"archived"`
	Restricted bool     `json:"restricted"`
	MemberIDs  []string `json:"member_ids"`
}

const projectSelect = `SELECT p.id, p.name, p.billable, p.rate_cents, p.archived, p.restricted,
       ARRAY(SELECT pm.user_id::text FROM project_members pm WHERE pm.project_id = p.id)
  FROM projects p`

func scanProjects(rows pgx.Rows) ([]Project, error) {
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Project, error) {
		var p Project
		err := r.Scan(&p.ID, &p.Name, &p.Billable, &p.RateCents, &p.Archived, &p.Restricted, &p.MemberIDs)
		return p, err
	})
}

// ListProjects returns every project of a workspace (the owner's view). forUserID,
// when set, keeps only the projects that member may work on.
func (s *Store) ListProjects(ctx context.Context, bizID, forUserID string) ([]Project, error) {
	rows, err := s.pool.Query(ctx, projectSelect+`
		 WHERE p.business_id = $1 AND ($2 = '' OR NOT p.restricted
		       OR EXISTS (SELECT 1 FROM project_members pm
		                   WHERE pm.project_id = p.id AND pm.user_id = NULLIF($2, '')::uuid))
		 ORDER BY p.archived, lower(p.name)`, bizID, forUserID)
	if err != nil {
		return nil, err
	}
	return scanProjects(rows)
}

// ProjectAllows reports whether a member may work on a project: no project at all,
// an open project, or one they are on. Owners are not checked here — handlers let
// them through.
func (s *Store) ProjectAllows(ctx context.Context, bizID, projectID, userID string) (bool, error) {
	if projectID == "" {
		return true, nil
	}
	var ok bool
	err := s.pool.QueryRow(ctx,
		`SELECT NOT p.restricted OR EXISTS (SELECT 1 FROM project_members pm
		          WHERE pm.project_id = p.id AND pm.user_id = $3)
		   FROM projects p WHERE p.business_id = $1 AND p.id = $2`, bizID, projectID, userID).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrNotFound
	}
	return ok, err
}

// TaskAllows is ProjectAllows for the project a task sits in.
func (s *Store) TaskAllows(ctx context.Context, bizID, taskID, userID string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(NOT p.restricted OR EXISTS (SELECT 1 FROM project_members pm
		          WHERE pm.project_id = p.id AND pm.user_id = $3), true)
		   FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
		  WHERE t.business_id = $1 AND t.id = $2`, bizID, taskID, userID).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrNotFound
	}
	return ok, err
}

// SaveProject creates or updates a project. p.MemberIDs replaces the allow-list when
// it is non-nil (ticket 163); a nil slice leaves the stored list alone. Every id must
// belong to a member of the workspace.
func (s *Store) SaveProject(ctx context.Context, bizID string, p Project) (Project, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return p, err
	}
	defer tx.Rollback(ctx)

	if p.ID == "" {
		err = tx.QueryRow(ctx,
			`INSERT INTO projects (business_id, name, billable, rate_cents, restricted)
			 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			bizID, p.Name, p.Billable, p.RateCents, p.Restricted).Scan(&p.ID)
	} else {
		var tag pgconn.CommandTag
		tag, err = tx.Exec(ctx,
			`UPDATE projects SET name = $3, billable = $4, rate_cents = $5, archived = $6, restricted = $7
			  WHERE business_id = $1 AND id = $2`,
			bizID, p.ID, p.Name, p.Billable, p.RateCents, p.Archived, p.Restricted)
		if err == nil && tag.RowsAffected() == 0 {
			err = ErrNotFound
		}
	}
	if err != nil {
		return p, err
	}
	if p.MemberIDs != nil {
		if _, err = tx.Exec(ctx, `DELETE FROM project_members WHERE project_id = $1 AND NOT (user_id::text = ANY($2))`,
			p.ID, p.MemberIDs); err != nil {
			return p, err
		}
		// Only real members of this workspace, and only once each.
		if _, err = tx.Exec(ctx,
			`INSERT INTO project_members (project_id, user_id)
			 SELECT $1, m.user_id FROM memberships m
			  WHERE m.business_id = $2 AND m.user_id::text = ANY($3)
			 ON CONFLICT DO NOTHING`, p.ID, bizID, p.MemberIDs); err != nil {
			return p, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return p, err
	}
	rows, err := s.pool.Query(ctx, projectSelect+` WHERE p.business_id = $1 AND p.id = $2`, bizID, p.ID)
	if err != nil {
		return p, err
	}
	list, err := scanProjects(rows)
	if err != nil || len(list) == 0 {
		return p, err
	}
	return list[0], nil
}

func (s *Store) DeleteProject(ctx context.Context, bizID, id string) error {
	return deleteScoped(ctx, s, `DELETE FROM projects WHERE business_id = $1 AND id = $2`, bizID, id)
}

// ---------- tasks ----------

type Task struct {
	ID           string  `json:"id"`
	ProjectID    string  `json:"project_id"`
	ProjectName  string  `json:"project_name"`
	Title        string  `json:"title"`
	Status       string  `json:"status"`
	AssigneeID   *string `json:"assignee_id"`
	AssigneeName string  `json:"assignee_name"`
	CreatedBy    *string `json:"created_by"`
	LoggedS      int64   `json:"logged_s"`
	CreatedAt    string  `json:"created_at"`
}

// A task may have no project (CTR-37): project_id / name then come back empty.
const taskSelect = `SELECT t.id, COALESCE(t.project_id::text, ''), COALESCE(p.name, ''), t.title, t.status, t.assignee_id,
       COALESCE(a.display_name, ''), t.created_by,
       COALESCE((SELECT sum(e.duration_s) FROM time_entries e WHERE e.task_id = t.id), 0),
       to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN users a ON a.id = t.assignee_id`

func scanTasks(rows pgx.Rows) ([]Task, error) {
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Task, error) {
		var t Task
		err := r.Scan(&t.ID, &t.ProjectID, &t.ProjectName, &t.Title, &t.Status, &t.AssigneeID,
			&t.AssigneeName, &t.CreatedBy, &t.LoggedS, &t.CreatedAt)
		return t, err
	})
}

// ListTasks returns a workspace's tasks. activeOnly skips tasks of archived projects
// (a project-less task is always active). forUserID, when set, also skips tasks in
// limited projects that member is not on (ticket 163).
func (s *Store) ListTasks(ctx context.Context, bizID string, activeOnly bool, forUserID string) ([]Task, error) {
	rows, err := s.pool.Query(ctx, taskSelect+`
		 WHERE t.business_id = $1 AND (NOT $2 OR COALESCE(NOT p.archived, true))
		   AND ($3 = '' OR COALESCE(NOT p.restricted OR EXISTS (SELECT 1 FROM project_members pm
		         WHERE pm.project_id = p.id AND pm.user_id = NULLIF($3, '')::uuid), true))
		 ORDER BY t.status, t.created_at DESC`, bizID, activeOnly, forUserID)
	if err != nil {
		return nil, err
	}
	return scanTasks(rows)
}

func (s *Store) GetTask(ctx context.Context, bizID, id string) (Task, error) {
	rows, err := s.pool.Query(ctx, taskSelect+` WHERE t.business_id = $1 AND t.id = $2`, bizID, id)
	if err != nil {
		return Task{}, err
	}
	list, err := scanTasks(rows)
	if err != nil {
		return Task{}, err
	}
	if len(list) == 0 {
		return Task{}, ErrNotFound
	}
	return list[0], nil
}

// SaveTask creates or updates a task. An empty ProjectID means no project (CTR-37);
// otherwise the project must be in the workspace and not archived (for new tasks).
// An assignee must be a member.
func (s *Store) SaveTask(ctx context.Context, bizID, actorID string, t Task) (Task, error) {
	if t.ProjectID != "" {
		var ok bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM projects WHERE business_id = $1 AND id = $2 AND (NOT archived OR $3))`,
			bizID, t.ProjectID, t.ID != "").Scan(&ok); err != nil {
			return t, err
		}
		if !ok {
			return t, ErrNotFound
		}
	}
	if t.AssigneeID != nil {
		role, err := s.MemberRole(ctx, *t.AssigneeID, bizID)
		if err != nil {
			return t, err
		}
		if role == "" {
			return t, ErrForbidden
		}
	}
	var err error
	if t.ID == "" {
		err = s.pool.QueryRow(ctx,
			`INSERT INTO tasks (business_id, project_id, title, status, assignee_id, created_by)
			 VALUES ($1, NULLIF($2, '')::uuid, $3, $4, $5, $6) RETURNING id`,
			bizID, t.ProjectID, t.Title, t.Status, t.AssigneeID, actorID).Scan(&t.ID)
	} else {
		var tag pgconn.CommandTag
		tag, err = s.pool.Exec(ctx,
			`UPDATE tasks SET project_id = NULLIF($3, '')::uuid, title = $4, status = $5, assignee_id = $6
			  WHERE business_id = $1 AND id = $2`,
			bizID, t.ID, t.ProjectID, t.Title, t.Status, t.AssigneeID)
		if err == nil && tag.RowsAffected() == 0 {
			err = ErrNotFound
		}
	}
	if err != nil {
		return t, err
	}
	return s.GetTask(ctx, bizID, t.ID)
}

func (s *Store) DeleteTask(ctx context.Context, bizID, id string) error {
	return deleteScoped(ctx, s, `DELETE FROM tasks WHERE business_id = $1 AND id = $2`, bizID, id)
}

// ---------- task detail (owner): time, screenshots, typing share ----------

// TaskStat is one member's contribution to a task. Keystrokes is the typing inside
// the task's timer windows; KeystrokesDay is all their typing on the days they
// logged time on it — the two give the share of typing that went to the task.
type TaskStat struct {
	UserID        string `json:"user_id"`
	UserName      string `json:"user_name"`
	Seconds       int64  `json:"seconds"`
	Keystrokes    int64  `json:"keystrokes"`
	KeystrokesDay int64  `json:"keystrokes_day"`
	Shots         int    `json:"shots"`
}

// TaskScreenshot is a screenshot captured while a timer ran on the task.
type TaskScreenshot struct {
	ScreenshotMeta
	UserID   string `json:"user_id"`
	UserName string `json:"user_name"`
}

type TaskDetail struct {
	Task        Task             `json:"task"`
	Entries     []TimeEntry      `json:"entries"`
	Stats       []TaskStat       `json:"stats"`
	Screenshots []TaskScreenshot `json:"screenshots"`
	ShotTotal   int              `json:"shot_total"`
}

// The wall-clock windows a timer ran on this task, per member. duration_s is active
// time only, so pre-ended_at rows fall back to started_at + duration_s.
const taskWindows = `WITH w AS (
		SELECT user_id,
		       extract(epoch FROM started_at)::bigint AS f,
		       extract(epoch FROM COALESCE(ended_at, started_at + make_interval(secs => duration_s)))::bigint AS t
		  FROM time_entries
		 WHERE business_id = $1 AND task_id = $2 AND started_at IS NOT NULL)`

// TaskDetail gathers everything the owner's task view shows: the task, all time
// logged on it, per-member stats, and the screenshots taken while its timer ran.
// tzOffsetMin (minutes east of UTC) maps keystroke buckets onto logged days.
func (s *Store) TaskDetail(ctx context.Context, bizID, taskID string, tzOffsetMin, shotLimit int) (TaskDetail, error) {
	var d TaskDetail
	task, err := s.GetTask(ctx, bizID, taskID)
	if err != nil {
		return d, err
	}
	d.Task = task

	rows, err := s.pool.Query(ctx, entrySelect+`
		 WHERE e.business_id = $1 AND e.task_id = $2
		 ORDER BY e.day DESC, e.created_at DESC`, bizID, taskID)
	if err != nil {
		return d, err
	}
	if d.Entries, err = scanEntries(rows); err != nil {
		return d, err
	}

	// Per member: logged seconds, typing inside the windows, typing that whole day,
	// and how many screenshots fell inside. DISTINCT guards against a member running
	// timers on two machines at once (overlapping windows would double-count).
	rows, err = s.pool.Query(ctx, taskWindows+`,
		secs AS (SELECT user_id, sum(duration_s)::bigint n FROM time_entries
		          WHERE business_id = $1 AND task_id = $2 GROUP BY 1),
		days AS (SELECT DISTINCT user_id, day FROM time_entries
		          WHERE business_id = $1 AND task_id = $2),
		ks AS (SELECT user_id, sum(count)::bigint n FROM (
		          SELECT DISTINCT k.id, k.user_id, k.count FROM keystroke_buckets k
		            JOIN w ON w.user_id = k.user_id AND k.ts_bucket >= w.f AND k.ts_bucket < w.t
		           WHERE k.business_id = $1) z GROUP BY 1),
		kd AS (SELECT user_id, sum(count)::bigint n FROM (
		          SELECT DISTINCT k.id, k.user_id, k.count FROM keystroke_buckets k
		            JOIN days d ON d.user_id = k.user_id
		             AND d.day = (timestamp 'epoch' + (k.ts_bucket + $3 * 60) * interval '1 second')::date
		           WHERE k.business_id = $1) z GROUP BY 1),
		sh AS (SELECT w.user_id, count(DISTINCT s.client_uuid)::int n FROM screenshots s
		          JOIN w ON w.user_id = s.user_id AND s.ts >= w.f AND s.ts < w.t
		         WHERE s.business_id = $1 GROUP BY 1)
		SELECT secs.user_id, COALESCE(u.display_name, ''), secs.n,
		       COALESCE(ks.n, 0), COALESCE(kd.n, 0), COALESCE(sh.n, 0)
		  FROM secs
		  LEFT JOIN users u ON u.id = secs.user_id
		  LEFT JOIN ks ON ks.user_id = secs.user_id
		  LEFT JOIN kd ON kd.user_id = secs.user_id
		  LEFT JOIN sh ON sh.user_id = secs.user_id
		 ORDER BY secs.n DESC`, bizID, taskID, tzOffsetMin)
	if err != nil {
		return d, err
	}
	d.Stats, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (TaskStat, error) {
		var x TaskStat
		err := r.Scan(&x.UserID, &x.UserName, &x.Seconds, &x.Keystrokes, &x.KeystrokesDay, &x.Shots)
		return x, err
	})
	if err != nil {
		return d, err
	}
	for _, x := range d.Stats {
		d.ShotTotal += x.Shots
	}

	rows, err = s.pool.Query(ctx, taskWindows+`
		SELECT DISTINCT s.client_uuid, s.ts, s.byte_size, s.width, s.height, s.display_id,
		       s.user_id, COALESCE(u.display_name, '')
		  FROM screenshots s
		  JOIN w ON w.user_id = s.user_id AND s.ts >= w.f AND s.ts < w.t
		  LEFT JOIN users u ON u.id = s.user_id
		 WHERE s.business_id = $1
		 ORDER BY s.ts DESC LIMIT $3`, bizID, taskID, shotLimit)
	if err != nil {
		return d, err
	}
	d.Screenshots, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (TaskScreenshot, error) {
		var x TaskScreenshot
		err := r.Scan(&x.ClientUUID, &x.Ts, &x.ByteSize, &x.Width, &x.Height, &x.DisplayID, &x.UserID, &x.UserName)
		return x, err
	})
	return d, err
}

// ---------- time entries ----------

type TimeEntry struct {
	ID            string  `json:"id"`
	UserID        string  `json:"user_id"`
	UserName      string  `json:"user_name"`
	TaskID        string  `json:"task_id"`
	TaskTitle     string  `json:"task_title"`
	ProjectID     string  `json:"project_id"`
	ProjectName   string  `json:"project_name"`
	Billable      bool    `json:"billable"`
	Day           string  `json:"day"`
	DurationS     int     `json:"duration_s"`
	Note          string  `json:"note"`
	Source        string  `json:"source"`
	StartedAt     *string `json:"started_at"`
	EndedAt       *string `json:"ended_at"`
	InvoiceID     *string `json:"invoice_id"`
	InvoiceNumber string  `json:"invoice_number"`
	ClientUUID    *string `json:"-"`
}

// The task's project may be missing (CTR-37): no project then means billable, since
// only a project can say otherwise.
const entrySelect = `SELECT e.id, e.user_id, u.display_name, e.task_id, t.title,
       COALESCE(p.id::text, ''), COALESCE(p.name, ''),
       COALESCE(p.billable, true), e.day::text, e.duration_s, e.note, e.source,
       to_char(e.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       to_char(e.ended_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), e.invoice_id, COALESCE(i.number, '')
  FROM time_entries e
  JOIN users u ON u.id = e.user_id
  JOIN tasks t ON t.id = e.task_id
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN invoices i ON i.id = e.invoice_id`

func scanEntries(rows pgx.Rows) ([]TimeEntry, error) {
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (TimeEntry, error) {
		var e TimeEntry
		err := r.Scan(&e.ID, &e.UserID, &e.UserName, &e.TaskID, &e.TaskTitle, &e.ProjectID, &e.ProjectName,
			&e.Billable, &e.Day, &e.DurationS, &e.Note, &e.Source, &e.StartedAt, &e.EndedAt,
			&e.InvoiceID, &e.InvoiceNumber)
		return e, err
	})
}

// EntryFilter narrows ListEntries; empty fields don't filter.
type EntryFilter struct {
	From, To  string // inclusive days
	UserID    string
	ProjectID string
}

func (s *Store) ListEntries(ctx context.Context, bizID string, f EntryFilter) ([]TimeEntry, error) {
	rows, err := s.pool.Query(ctx, entrySelect+`
		 WHERE e.business_id = $1 AND e.day BETWEEN $2::date AND $3::date
		   AND ($4 = '' OR e.user_id::text = $4) AND ($5 = '' OR p.id::text = $5)
		 ORDER BY e.day DESC, e.created_at DESC`, bizID, f.From, f.To, f.UserID, f.ProjectID)
	if err != nil {
		return nil, err
	}
	return scanEntries(rows)
}

func (s *Store) GetEntry(ctx context.Context, bizID, id string) (TimeEntry, error) {
	rows, err := s.pool.Query(ctx, entrySelect+` WHERE e.business_id = $1 AND e.id = $2`, bizID, id)
	if err != nil {
		return TimeEntry{}, err
	}
	list, err := scanEntries(rows)
	if err != nil {
		return TimeEntry{}, err
	}
	if len(list) == 0 {
		return TimeEntry{}, ErrNotFound
	}
	return list[0], nil
}

// SaveEntry creates or updates time. The task must be in the workspace and the
// user a member; billed (invoiced) time is locked. A repeated client_uuid returns
// the entry already stored (idempotent timer uploads).
func (s *Store) SaveEntry(ctx context.Context, bizID string, e TimeEntry) (TimeEntry, error) {
	var ok bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM tasks WHERE business_id = $1 AND id = $2)`,
		bizID, e.TaskID).Scan(&ok); err != nil {
		return e, err
	}
	if !ok {
		return e, ErrNotFound
	}
	if role, err := s.MemberRole(ctx, e.UserID, bizID); err != nil {
		return e, err
	} else if role == "" {
		return e, ErrForbidden
	}
	if e.ID == "" {
		err := s.pool.QueryRow(ctx,
			`INSERT INTO time_entries (business_id, user_id, task_id, day, duration_s, note, source, started_at, ended_at, client_uuid)
			 VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10)
			 ON CONFLICT (client_uuid) DO NOTHING RETURNING id`,
			bizID, e.UserID, e.TaskID, e.Day, e.DurationS, e.Note, e.Source, e.StartedAt, e.EndedAt,
			e.ClientUUID).Scan(&e.ID)
		if errors.Is(err, pgx.ErrNoRows) && e.ClientUUID != nil {
			err = s.pool.QueryRow(ctx, `SELECT id FROM time_entries WHERE business_id = $1 AND client_uuid = $2`,
				bizID, *e.ClientUUID).Scan(&e.ID)
			if errors.Is(err, pgx.ErrNoRows) {
				return e, ErrConflict // that uuid belongs to another workspace
			}
		}
		if err != nil {
			return e, err
		}
	} else {
		tag, err := s.pool.Exec(ctx,
			`UPDATE time_entries SET user_id = $3, task_id = $4, day = $5::date, duration_s = $6, note = $7, updated_at = now()
			  WHERE business_id = $1 AND id = $2 AND invoice_id IS NULL`,
			bizID, e.ID, e.UserID, e.TaskID, e.Day, e.DurationS, e.Note)
		if err != nil {
			return e, err
		}
		if tag.RowsAffected() == 0 {
			if _, gerr := s.GetEntry(ctx, bizID, e.ID); gerr != nil {
				return e, gerr
			}
			return e, ErrLocked
		}
	}
	return s.GetEntry(ctx, bizID, e.ID)
}

func (s *Store) DeleteEntry(ctx context.Context, bizID, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM time_entries WHERE business_id = $1 AND id = $2 AND invoice_id IS NULL`, bizID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		if _, gerr := s.GetEntry(ctx, bizID, id); gerr != nil {
			return gerr
		}
		return ErrLocked
	}
	return nil
}

// TrackedDay is automatically tracked active time for one member on one local day.
type TrackedDay struct {
	UserID string `json:"user_id"`
	Day    string `json:"day"`
	Secs   int64  `json:"seconds"`
}

// TrackedTime sums tracked activity per member per local day (tzOffsetMin = the
// viewer's UTC offset in minutes), so logged hours can be compared with it.
func (s *Store) TrackedTime(ctx context.Context, bizID, from, to string, tzOffsetMin int) ([]TrackedDay, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT user_id, to_timestamp(ts + $4 * 60)::date::text AS d, sum(duration_s)
		   FROM activity_samples
		  WHERE business_id = $1
		    AND ts >= extract(epoch FROM $2::date) - $4 * 60
		    AND ts <  extract(epoch FROM $3::date + 1) - $4 * 60
		  GROUP BY user_id, d`, bizID, from, to, tzOffsetMin)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (TrackedDay, error) {
		var d TrackedDay
		err := r.Scan(&d.UserID, &d.Day, &d.Secs)
		return d, err
	})
}

// ---------- invoices ----------

type Invoice struct {
	ID            string         `json:"id"`
	UserID        string         `json:"user_id"`
	UserName      string         `json:"user_name"`
	UserLogin     string         `json:"user_login"`
	UserDetails   string         `json:"user_details"` // the member's own "from" block
	Number        string         `json:"number"`
	Status        string         `json:"status"`
	IssueDate     string         `json:"issue_date"`
	DueDate       string         `json:"due_date"`
	PeriodFrom    string         `json:"period_from"`
	PeriodTo      string         `json:"period_to"`
	Currency      string         `json:"currency"`
	SubtotalCents int64          `json:"subtotal_cents"`
	TaxBP         int            `json:"tax_bp"`
	TaxCents      int64          `json:"tax_cents"`
	TotalCents    int64          `json:"total_cents"`
	Notes         string         `json:"notes"`
	SentAt        *string        `json:"sent_at"`
	PaidAt        *string        `json:"paid_at"`
	Lines         []billing.Line `json:"lines,omitempty"`
}

const invoiceSelect = `SELECT i.id, i.user_id, u.display_name, COALESCE(u.username, u.email, ''),
       COALESCE(m.billing_details, ''), i.number, i.status, i.issue_date::text,
       i.due_date::text, i.period_from::text, i.period_to::text, i.currency, i.subtotal_cents, i.tax_bp,
       i.tax_cents, i.total_cents, i.notes,
       to_char(i.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       to_char(i.paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  FROM invoices i JOIN users u ON u.id = i.user_id
  LEFT JOIN memberships m ON m.user_id = i.user_id AND m.business_id = i.business_id`

func scanInvoices(rows pgx.Rows) ([]Invoice, error) {
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Invoice, error) {
		var i Invoice
		err := r.Scan(&i.ID, &i.UserID, &i.UserName, &i.UserLogin, &i.UserDetails, &i.Number, &i.Status,
			&i.IssueDate, &i.DueDate, &i.PeriodFrom, &i.PeriodTo, &i.Currency, &i.SubtotalCents, &i.TaxBP,
			&i.TaxCents, &i.TotalCents, &i.Notes, &i.SentAt, &i.PaidAt)
		return i, err
	})
}

// ListInvoices returns a workspace's invoices; userID limits them to one member's own.
func (s *Store) ListInvoices(ctx context.Context, bizID, userID string) ([]Invoice, error) {
	rows, err := s.pool.Query(ctx, invoiceSelect+`
		 WHERE i.business_id = $1 AND ($2 = '' OR i.user_id::text = $2)
		 ORDER BY i.issue_date DESC, i.number DESC`, bizID, userID)
	if err != nil {
		return nil, err
	}
	return scanInvoices(rows)
}

// GetInvoice loads one invoice with its lines; onlyUser, when set, restricts it to
// that member's own.
func (s *Store) GetInvoice(ctx context.Context, bizID, id, onlyUser string) (Invoice, error) {
	rows, err := s.pool.Query(ctx, invoiceSelect+`
		 WHERE i.business_id = $1 AND i.id = $2 AND ($3 = '' OR i.user_id::text = $3)`, bizID, id, onlyUser)
	if err != nil {
		return Invoice{}, err
	}
	list, err := scanInvoices(rows)
	if err != nil {
		return Invoice{}, err
	}
	if len(list) == 0 {
		return Invoice{}, ErrNotFound
	}
	inv := list[0]
	lrows, err := s.pool.Query(ctx,
		`SELECT l.description, COALESCE(l.user_id::text, ''), COALESCE(u.display_name, ''), COALESCE(l.task_id::text, ''),
		        l.seconds, l.rate_cents, l.amount_cents
		   FROM invoice_lines l LEFT JOIN users u ON u.id = l.user_id
		  WHERE l.invoice_id = $1 ORDER BY l.position`, id)
	if err != nil {
		return inv, err
	}
	inv.Lines, err = pgx.CollectRows(lrows, func(r pgx.CollectableRow) (billing.Line, error) {
		var l billing.Line
		err := r.Scan(&l.Description, &l.UserID, &l.UserName, &l.TaskID, &l.Seconds, &l.RateCents, &l.AmountCents)
		return l, err
	})
	return inv, err
}

type entryQuerier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

// unbilledEntries returns one member's billable, not-yet-invoiced time in a period,
// with each entry's rate resolved.
func (s *Store) unbilledEntries(ctx context.Context, q entryQuerier, bizID, userID, from, to string) ([]billing.Entry, error) {
	history, err := s.rateHistory(ctx, q, bizID)
	if err != nil {
		return nil, err
	}
	rows, err := q.Query(ctx,
		`SELECT e.id, e.user_id, u.display_name, e.task_id, t.title, COALESCE(p.name, ''), e.day::text, e.duration_s, p.rate_cents
		   FROM time_entries e
		   JOIN users u ON u.id = e.user_id
		   JOIN tasks t ON t.id = e.task_id
		   LEFT JOIN projects p ON p.id = t.project_id
		  WHERE e.business_id = $1 AND e.user_id = $2 AND COALESCE(p.billable, true) AND e.invoice_id IS NULL
		    AND e.day BETWEEN $3::date AND $4::date
		  ORDER BY e.day, e.id`, bizID, userID, from, to)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (billing.Entry, error) {
		var e billing.Entry
		var projectRate *int
		err := r.Scan(&e.ID, &e.UserID, &e.UserName, &e.TaskID, &e.TaskTitle, &e.ProjectName, &e.Day, &e.Seconds, &projectRate)
		e.RateCents, e.HasRate = billing.EntryRate(projectRate, history, e.UserID, e.Day)
		return e, err
	})
}

// PreviewInvoice shows what a member's invoice for a period would contain.
func (s *Store) PreviewInvoice(ctx context.Context, bizID, userID, from, to string, taxBP int) (billing.Draft, error) {
	entries, err := s.unbilledEntries(ctx, s.pool, bizID, userID, from, to)
	if err != nil {
		return billing.Draft{}, err
	}
	return billing.BuildDraft(entries, taxBP), nil
}

// NewInvoice is what a member fills in to raise an invoice.
type NewInvoice struct {
	UserID    string
	From, To  string
	IssueDate string
	DueDate   string
	TaxBP     int
	Notes     string
}

// CreateInvoice builds a draft invoice from the member's unbilled time, freezes the
// rates on its lines and locks the entries — all in one transaction, numbered from
// the workspace counter. Returns ErrNotFound when the member isn't in the workspace
// and ErrConflict when they have no unbilled time.
func (s *Store) CreateInvoice(ctx context.Context, bizID string, n NewInvoice) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var currency string
	var next int
	// Row lock: concurrent invoices get distinct numbers and can't both grab the same time.
	if err := tx.QueryRow(ctx, `SELECT currency, invoice_next_number FROM businesses WHERE id = $1 FOR UPDATE`, bizID).
		Scan(&currency, &next); err != nil {
		return "", err
	}
	var ok bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM memberships WHERE business_id = $1 AND user_id = $2)`,
		bizID, n.UserID).Scan(&ok); err != nil {
		return "", err
	}
	if !ok {
		return "", ErrNotFound
	}
	entries, err := s.unbilledEntries(ctx, tx, bizID, n.UserID, n.From, n.To)
	if err != nil {
		return "", err
	}
	if len(entries) == 0 {
		return "", ErrConflict
	}
	d := billing.BuildDraft(entries, n.TaxBP)

	var id string
	if err := tx.QueryRow(ctx,
		`INSERT INTO invoices (business_id, user_id, number, issue_date, due_date, period_from, period_to, currency,
		                       subtotal_cents, tax_bp, tax_cents, total_cents, notes)
		 VALUES ($1, $2, $3, $4::date, $5::date, $6::date, $7::date, $8, $9, $10, $11, $12, $13) RETURNING id`,
		bizID, n.UserID, billing.InvoiceNumber(next), n.IssueDate, n.DueDate, n.From, n.To, currency,
		d.SubtotalCents, n.TaxBP, d.TaxCents, d.TotalCents, n.Notes).Scan(&id); err != nil {
		return "", err
	}
	for i, l := range d.Lines {
		if _, err := tx.Exec(ctx,
			`INSERT INTO invoice_lines (invoice_id, position, description, user_id, task_id, seconds, rate_cents, amount_cents)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			id, i, l.Description, l.UserID, l.TaskID, l.Seconds, l.RateCents, l.AmountCents); err != nil {
			return "", err
		}
	}
	if _, err := tx.Exec(ctx,
		`UPDATE time_entries SET invoice_id = $2 WHERE business_id = $3 AND id = ANY($1::uuid[]) AND invoice_id IS NULL`,
		d.EntryIDs, id, bizID); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `UPDATE businesses SET invoice_next_number = invoice_next_number + 1 WHERE id = $1`, bizID); err != nil {
		return "", err
	}
	return id, tx.Commit(ctx)
}

// InvoiceUpdate changes an invoice's status and/or its editable fields. Due date,
// tax and notes can only change while it's a draft, and only for the member who
// raised it; ByOwner says which side is asking (ticket 159).
type InvoiceUpdate struct {
	Status  *string
	DueDate *string
	TaxBP   *int
	Notes   *string
	ByOwner bool
}

// UpdateInvoice applies u. onlyUser, when set, restricts it to that member's own
// invoice. Voiding releases the invoice's time so it can be billed again. Returns
// ErrConflict for an invalid status change or editing a non-draft.
func (s *Store) UpdateInvoice(ctx context.Context, bizID, id, onlyUser string, u InvoiceUpdate) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var status string
	var subtotal int64
	err = tx.QueryRow(ctx, `SELECT status, subtotal_cents FROM invoices
		  WHERE business_id = $1 AND id = $2 AND ($3 = '' OR user_id::text = $3) FOR UPDATE`,
		bizID, id, onlyUser).Scan(&status, &subtotal)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if u.DueDate != nil || u.TaxBP != nil || u.Notes != nil {
		if status != "draft" || u.ByOwner {
			return ErrConflict
		}
		if u.DueDate != nil {
			if _, err := tx.Exec(ctx, `UPDATE invoices SET due_date = $2::date WHERE id = $1`, id, *u.DueDate); err != nil {
				return err
			}
		}
		if u.Notes != nil {
			if _, err := tx.Exec(ctx, `UPDATE invoices SET notes = $2 WHERE id = $1`, id, *u.Notes); err != nil {
				return err
			}
		}
		if u.TaxBP != nil {
			tax := billing.Tax(subtotal, *u.TaxBP)
			if _, err := tx.Exec(ctx, `UPDATE invoices SET tax_bp = $2, tax_cents = $3, total_cents = subtotal_cents + $3 WHERE id = $1`,
				id, *u.TaxBP, tax); err != nil {
				return err
			}
		}
	}
	if u.Status != nil && *u.Status != status {
		if !billing.NextStatus(status, *u.Status, u.ByOwner) {
			return ErrConflict
		}
		now := time.Now()
		switch *u.Status {
		case "sent":
			_, err = tx.Exec(ctx, `UPDATE invoices SET status = 'sent', sent_at = COALESCE(sent_at, $2), paid_at = NULL WHERE id = $1`, id, now)
		case "paid":
			_, err = tx.Exec(ctx, `UPDATE invoices SET status = 'paid', paid_at = $2 WHERE id = $1`, id, now)
		case "void":
			if _, err = tx.Exec(ctx, `UPDATE invoices SET status = 'void' WHERE id = $1`, id); err == nil {
				_, err = tx.Exec(ctx, `UPDATE time_entries SET invoice_id = NULL WHERE invoice_id = $1`, id)
			}
		}
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// DeleteInvoice removes a draft and releases its time; onlyUser, when set, restricts
// it to that member's own. Sent/paid invoices must be voided instead (ErrConflict) so
// the numbering keeps an audit trail.
func (s *Store) DeleteInvoice(ctx context.Context, bizID, id, onlyUser string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var status string
	err = tx.QueryRow(ctx, `SELECT status FROM invoices
		  WHERE business_id = $1 AND id = $2 AND ($3 = '' OR user_id::text = $3) FOR UPDATE`,
		bizID, id, onlyUser).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if status != "draft" {
		return ErrConflict
	}
	// time_entries.invoice_id is ON DELETE SET NULL, so the time is released.
	if _, err := tx.Exec(ctx, `DELETE FROM invoices WHERE id = $1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
