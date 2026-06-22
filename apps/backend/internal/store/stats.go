package store

import (
	"context"
	"time"
)

// DownloadCount is the running total for one installer file.
type DownloadCount struct {
	File      string    `json:"file"`
	Platform  string    `json:"platform"`
	Count     int64     `json:"count"`
	UpdatedAt time.Time `json:"updated_at"`
}

// IncrementDownload bumps the counter for a served installer file (upsert). The
// platform is stored on first sight so the readout can group by OS.
func (s *Store) IncrementDownload(ctx context.Context, file, platform string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO download_counts (file, platform, count, updated_at)
		VALUES ($1, $2, 1, now())
		ON CONFLICT (file) DO UPDATE
		  SET count = download_counts.count + 1, updated_at = now()`,
		file, platform)
	return err
}

// DownloadCounts returns every installer counter, most-downloaded first.
func (s *Store) DownloadCounts(ctx context.Context) ([]DownloadCount, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT file, platform, count, updated_at FROM download_counts ORDER BY count DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]DownloadCount, 0)
	for rows.Next() {
		var d DownloadCount
		if err := rows.Scan(&d.File, &d.Platform, &d.Count, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
