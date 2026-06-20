package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// IsBusinessOwner reports whether ownerID owns businessID.
func (s *Store) IsBusinessOwner(ctx context.Context, ownerID, businessID string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM businesses WHERE id = $1 AND owner_user_id = $2)`,
		businessID, ownerID).Scan(&ok)
	return ok, err
}

// OwnsEmployee reports whether ownerID owns a business the employee belongs to.
func (s *Store) OwnsEmployee(ctx context.Context, ownerID, employeeID string) (bool, error) {
	var ok bool
	// role IN ('owner','employee') so an owner can also view their own activity.
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(
		    SELECT 1 FROM memberships m
		      JOIN businesses b ON b.id = m.business_id
		     WHERE m.user_id = $1 AND m.role IN ('owner','employee') AND b.owner_user_id = $2)`,
		employeeID, ownerID).Scan(&ok)
	return ok, err
}

// RosterEntry is one employee row with rollups for the dashboard roster.
type RosterEntry struct {
	ID           string     `json:"id"`
	Email        string     `json:"email"`
	Username     string     `json:"username"`
	DisplayName  string     `json:"display_name"`
	Role         string     `json:"role"` // 'owner' (self) | 'employee'
	LastSeen     *time.Time `json:"last_seen"`
	ActiveTodayS int64      `json:"active_today_s"`
}

// Roster returns a business's employees with last-seen and active seconds in the
// given [dayStart, dayEnd) window.
func (s *Store) Roster(ctx context.Context, businessID string, dayStart, dayEnd int64) ([]RosterEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT u.id, COALESCE(u.email, ''), COALESCE(u.username, ''), u.display_name, m.role,
		       (SELECT max(last_seen_at) FROM devices d WHERE d.user_id = u.id) AS last_seen,
		       COALESCE((SELECT sum(duration_s) FROM activity_samples a
		                  WHERE a.user_id = u.id AND a.business_id = $1
		                    AND a.ts >= $2 AND a.ts < $3), 0) AS active_today
		  FROM memberships m
		  JOIN users u ON u.id = m.user_id
		 WHERE m.business_id = $1 AND m.role IN ('owner','employee')
		 ORDER BY (m.role = 'owner') DESC, u.display_name`, businessID, dayStart, dayEnd)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []RosterEntry{}
	for rows.Next() {
		var e RosterEntry
		if err := rows.Scan(&e.ID, &e.Email, &e.Username, &e.DisplayName, &e.Role, &e.LastSeen, &e.ActiveTodayS); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// All per-employee reads are scoped to businesses the caller owns via this filter,
// so an owner can never read another business's data.
const ownedFilter = `business_id IN (SELECT id FROM businesses WHERE owner_user_id = $2)`

// ActivitySample is one app-usage interval in a report.
type ActivitySample struct {
	Ts          int64   `json:"ts"`
	AppName     string  `json:"app_name"`
	WindowTitle *string `json:"window_title"`
	DurationS   int     `json:"duration_s"`
}

// AppBreakdown is total active seconds per app.
type AppBreakdown struct {
	AppName   string `json:"app_name"`
	DurationS int64  `json:"duration_s"`
}

// ActivityReport returns the timeline samples plus a per-app breakdown.
func (s *Store) ActivityReport(ctx context.Context, employeeID, ownerID string, from, to int64) ([]ActivitySample, []AppBreakdown, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT ts, app_name, window_title, duration_s
		   FROM activity_samples
		  WHERE user_id = $1 AND `+ownedFilter+` AND ts >= $3 AND ts < $4
		  ORDER BY ts`, employeeID, ownerID, from, to)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	samples := []ActivitySample{}
	for rows.Next() {
		var a ActivitySample
		if err := rows.Scan(&a.Ts, &a.AppName, &a.WindowTitle, &a.DurationS); err != nil {
			return nil, nil, err
		}
		samples = append(samples, a)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	brk, err := s.pool.Query(ctx,
		`SELECT app_name, sum(duration_s)
		   FROM activity_samples
		  WHERE user_id = $1 AND `+ownedFilter+` AND ts >= $3 AND ts < $4
		  GROUP BY app_name ORDER BY sum(duration_s) DESC`, employeeID, ownerID, from, to)
	if err != nil {
		return nil, nil, err
	}
	defer brk.Close()

	breakdown := []AppBreakdown{}
	for brk.Next() {
		var b AppBreakdown
		if err := brk.Scan(&b.AppName, &b.DurationS); err != nil {
			return nil, nil, err
		}
		breakdown = append(breakdown, b)
	}
	return samples, breakdown, brk.Err()
}

// KeystrokeBucket is one count bucket in a report.
type KeystrokeBucket struct {
	TsBucket int64 `json:"ts_bucket"`
	Count    int   `json:"count"`
}

// KeystrokesReport returns count buckets in range (counts only — never keys).
func (s *Store) KeystrokesReport(ctx context.Context, employeeID, ownerID string, from, to int64) ([]KeystrokeBucket, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT ts_bucket, count FROM keystroke_buckets
		  WHERE user_id = $1 AND `+ownedFilter+` AND ts_bucket >= $3 AND ts_bucket < $4
		  ORDER BY ts_bucket`, employeeID, ownerID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []KeystrokeBucket{}
	for rows.Next() {
		var b KeystrokeBucket
		if err := rows.Scan(&b.TsBucket, &b.Count); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// BrowserVisit is one page visit in a report.
type BrowserVisit struct {
	Ts        int64   `json:"ts"`
	URL       string  `json:"url"`
	PageTitle *string `json:"page_title"`
	Browser   *string `json:"browser"`
	DurationS int     `json:"duration_s"`
}

// BrowserReport returns page visits in range, most recent first.
func (s *Store) BrowserReport(ctx context.Context, employeeID, ownerID string, from, to int64) ([]BrowserVisit, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT ts, url, page_title, browser, duration_s FROM browser_visits
		  WHERE user_id = $1 AND `+ownedFilter+` AND ts >= $3 AND ts < $4
		  ORDER BY ts DESC`, employeeID, ownerID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []BrowserVisit{}
	for rows.Next() {
		var v BrowserVisit
		if err := rows.Scan(&v.Ts, &v.URL, &v.PageTitle, &v.Browser, &v.DurationS); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// ScreenshotMeta is screenshot metadata in a report (no bytes).
type ScreenshotMeta struct {
	ClientUUID string `json:"client_uuid"`
	Ts         int64  `json:"ts"`
	ByteSize   int    `json:"byte_size"`
	Width      *int   `json:"width"`
	Height     *int   `json:"height"`
	DisplayID  *int   `json:"display_id"`
}

// ScreenshotsReport returns paginated screenshot metadata, most recent first.
func (s *Store) ScreenshotsReport(ctx context.Context, employeeID, ownerID string, from, to int64, limit, offset int) ([]ScreenshotMeta, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT client_uuid, ts, byte_size, width, height, display_id FROM screenshots
		  WHERE user_id = $1 AND `+ownedFilter+` AND ts >= $3 AND ts < $4
		  ORDER BY ts DESC LIMIT $5 OFFSET $6`, employeeID, ownerID, from, to, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ScreenshotMeta{}
	for rows.Next() {
		var m ScreenshotMeta
		if err := rows.Scan(&m.ClientUUID, &m.Ts, &m.ByteSize, &m.Width, &m.Height, &m.DisplayID); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ScreenshotPathForOwner returns the stored file path for a screenshot the caller is
// authorized to view (it belongs to a business they own). ErrNotFound otherwise — we
// don't distinguish "missing" from "not yours", to avoid leaking existence.
func (s *Store) ScreenshotPathForOwner(ctx context.Context, ownerID, clientUUID string) (string, error) {
	var path string
	err := s.pool.QueryRow(ctx,
		`SELECT s.file_path FROM screenshots s
		   JOIN businesses b ON b.id = s.business_id
		  WHERE s.client_uuid = $1 AND b.owner_user_id = $2`,
		clientUUID, ownerID).Scan(&path)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return path, err
}
