package store

import "context"

// ScreenshotFile identifies a stored screenshot for cleanup.
type ScreenshotFile struct {
	ID       int64
	FilePath string
	ByteSize int
}

// ScreenshotsBefore lists a business's screenshots with ts strictly before cutoff.
func (s *Store) ScreenshotsBefore(ctx context.Context, businessID string, cutoffTs int64) ([]ScreenshotFile, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, file_path, byte_size FROM screenshots
		  WHERE business_id = $1 AND ts < $2`, businessID, cutoffTs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ScreenshotFile{}
	for rows.Next() {
		var f ScreenshotFile
		if err := rows.Scan(&f.ID, &f.FilePath, &f.ByteSize); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// DeleteScreenshotsByIDs removes screenshot rows by id, returning the count deleted.
func (s *Store) DeleteScreenshotsByIDs(ctx context.Context, ids []int64) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	ct, err := s.pool.Exec(ctx, `DELETE FROM screenshots WHERE id = ANY($1)`, ids)
	if err != nil {
		return 0, err
	}
	return ct.RowsAffected(), nil
}

// BusinessRetention is a business and its configured retention window.
type BusinessRetention struct {
	ID   string
	Days int
}

// BusinessesWithRetention lists businesses that have a retention policy set.
func (s *Store) BusinessesWithRetention(ctx context.Context) ([]BusinessRetention, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, screenshot_retention_days FROM businesses
		  WHERE screenshot_retention_days IS NOT NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []BusinessRetention{}
	for rows.Next() {
		var b BusinessRetention
		if err := rows.Scan(&b.ID, &b.Days); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// ScreenshotRow is screenshot metadata to persist. Nullable columns use pointers.
type ScreenshotRow struct {
	ClientUUID      string
	DeviceID        string
	Ts              int64
	FilePath        string
	ByteSize        int
	Width           *int
	Height          *int
	DisplayID       *int
	ClientUpdatedAt int64
}

const screenshotUpsert = `
INSERT INTO screenshots
  (client_uuid, user_id, business_id, device_id, ts, file_path, byte_size, width, height, display_id, client_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
ON CONFLICT (client_uuid) DO UPDATE SET
  ts = EXCLUDED.ts, file_path = EXCLUDED.file_path, byte_size = EXCLUDED.byte_size,
  width = EXCLUDED.width, height = EXCLUDED.height, display_id = EXCLUDED.display_id,
  client_updated_at = EXCLUDED.client_updated_at, received_at = now()`

// UpsertScreenshot idempotently records screenshot metadata keyed by client_uuid.
func (s *Store) UpsertScreenshot(ctx context.Context, userID, businessID string, r ScreenshotRow) error {
	_, err := s.pool.Exec(ctx, screenshotUpsert,
		r.ClientUUID, userID, businessID, r.DeviceID, r.Ts,
		r.FilePath, r.ByteSize, r.Width, r.Height, r.DisplayID, r.ClientUpdatedAt)
	return err
}
