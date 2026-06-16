package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// ErrAmbiguousBusiness is returned when a user belongs to multiple businesses and
// the sync request didn't say which one the data is for.
var ErrAmbiguousBusiness = errors.New("ambiguous business")

// Row types mirror the desktop's local tables. Nullable columns use pointers.

// ActivityRow is one foreground-app interval.
type ActivityRow struct {
	ClientUUID      string
	Ts              int64
	AppName         string
	WindowTitle     *string
	Pid             *int
	DurationS       int
	ClientUpdatedAt int64
}

// KeystrokeRow is one keypress-count bucket (counts only — never keys).
type KeystrokeRow struct {
	ClientUUID      string
	TsBucket        int64
	Count           int
	ClientUpdatedAt int64
}

// BrowserRow is one page visit reported by the extension.
type BrowserRow struct {
	ClientUUID      string
	Ts              int64
	URL             string
	PageTitle       *string
	Browser         *string
	DurationS       int
	ClientUpdatedAt int64
}

// ResolveBusinessForUser determines which business synced data belongs to. If
// explicit is non-nil it must be a business the user is a member of. Otherwise the
// user's single membership is used; zero memberships → ErrNotFound, more than one →
// ErrAmbiguousBusiness (the client must specify business_id).
func (s *Store) ResolveBusinessForUser(ctx context.Context, userID string, explicit *string) (string, error) {
	if explicit != nil {
		member, err := s.IsMember(ctx, userID, *explicit)
		if err != nil {
			return "", err
		}
		if !member {
			return "", ErrForbidden
		}
		return *explicit, nil
	}

	rows, err := s.pool.Query(ctx, `SELECT business_id FROM memberships WHERE user_id = $1`, userID)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return "", err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	switch len(ids) {
	case 0:
		return "", ErrNotFound
	case 1:
		return ids[0], nil
	default:
		return "", ErrAmbiguousBusiness
	}
}

const (
	activityUpsert = `
INSERT INTO activity_samples
  (client_uuid, user_id, business_id, device_id, ts, app_name, window_title, pid, duration_s, client_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT (client_uuid) DO UPDATE SET
  ts = EXCLUDED.ts, app_name = EXCLUDED.app_name, window_title = EXCLUDED.window_title,
  pid = EXCLUDED.pid, duration_s = EXCLUDED.duration_s,
  client_updated_at = EXCLUDED.client_updated_at, received_at = now()`

	keystrokeUpsert = `
INSERT INTO keystroke_buckets
  (client_uuid, user_id, business_id, device_id, ts_bucket, count, client_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7)
ON CONFLICT (client_uuid) DO UPDATE SET
  ts_bucket = EXCLUDED.ts_bucket, count = EXCLUDED.count,
  client_updated_at = EXCLUDED.client_updated_at, received_at = now()`

	browserUpsert = `
INSERT INTO browser_visits
  (client_uuid, user_id, business_id, device_id, ts, url, page_title, browser, duration_s, client_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT (client_uuid) DO UPDATE SET
  ts = EXCLUDED.ts, url = EXCLUDED.url, page_title = EXCLUDED.page_title,
  browser = EXCLUDED.browser, duration_s = EXCLUDED.duration_s,
  client_updated_at = EXCLUDED.client_updated_at, received_at = now()`

	deviceUpsert = `
INSERT INTO devices (id, user_id, label, last_seen_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  label = COALESCE(EXCLUDED.label, devices.label),
  last_seen_at = now()`
)

// SyncBatch upserts a batch of activity/keystroke/browser rows for one user+business
// +device, in a single transaction. Idempotent by client_uuid; the client's values
// always win (respect local). user_id/business_id come from the caller (token +
// membership), never the payload, so a row can't claim another user.
func (s *Store) SyncBatch(ctx context.Context, userID, businessID, deviceID string, label *string,
	act []ActivityRow, ks []KeystrokeRow, br []BrowserRow) error {

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, deviceUpsert, deviceID, userID, label); err != nil {
		return err
	}

	batch := &pgx.Batch{}
	for _, a := range act {
		batch.Queue(activityUpsert, a.ClientUUID, userID, businessID, deviceID,
			a.Ts, a.AppName, a.WindowTitle, a.Pid, a.DurationS, a.ClientUpdatedAt)
	}
	for _, k := range ks {
		batch.Queue(keystrokeUpsert, k.ClientUUID, userID, businessID, deviceID,
			k.TsBucket, k.Count, k.ClientUpdatedAt)
	}
	for _, b := range br {
		batch.Queue(browserUpsert, b.ClientUUID, userID, businessID, deviceID,
			b.Ts, b.URL, b.PageTitle, b.Browser, b.DurationS, b.ClientUpdatedAt)
	}

	if batch.Len() > 0 {
		res := tx.SendBatch(ctx, batch)
		for i := 0; i < batch.Len(); i++ {
			if _, err := res.Exec(); err != nil {
				res.Close()
				return err
			}
		}
		if err := res.Close(); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}
