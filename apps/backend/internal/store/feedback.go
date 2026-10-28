package store

import "context"

// Feedback is one message a desktop user sent from the app's What's new page
// (ticket 160). UserID is nil when it came from a personal-mode / logged-out app.
type Feedback struct {
	UserID     *string
	Email      string
	Kind       string
	Message    string
	AppVersion string
	Platform   string
	Locale     string
}

// SaveFeedback stores one submission.
func (s *Store) SaveFeedback(ctx context.Context, f Feedback) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO feedback (user_id, email, kind, message, app_version, platform, locale)
		 VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
		f.UserID, f.Email, f.Kind, f.Message, f.AppVersion, f.Platform, f.Locale)
	return err
}

// FeedbackRow is a stored submission as the super-admin list shows it; Account is
// the sender's account (display name + login), empty when they had no account.
type FeedbackRow struct {
	ID         int64  `json:"id"`
	Account    string `json:"account"`
	Email      string `json:"email"`
	Kind       string `json:"kind"`
	Message    string `json:"message"`
	AppVersion string `json:"app_version"`
	Platform   string `json:"platform"`
	Locale     string `json:"locale"`
	// RFC3339 in UTC, so the browser can parse it regardless of server timezone.
	CreatedAt string `json:"created_at"`
}

// ListFeedback returns submissions newest first, plus the total count so the
// caller can page through them.
func (s *Store) ListFeedback(ctx context.Context, limit, offset int) ([]FeedbackRow, int, error) {
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM feedback`).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := s.pool.Query(ctx,
		`SELECT f.id,
		        coalesce(nullif(u.display_name, ''), nullif(u.username, ''), nullif(u.email, ''), '') AS account,
		        f.email, f.kind, f.message, f.app_version, f.platform, f.locale,
		        to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
		   FROM feedback f
		   LEFT JOIN users u ON u.id = f.user_id
		  ORDER BY f.created_at DESC, f.id DESC
		  LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []FeedbackRow{}
	for rows.Next() {
		var r FeedbackRow
		if err := rows.Scan(&r.ID, &r.Account, &r.Email, &r.Kind, &r.Message,
			&r.AppVersion, &r.Platform, &r.Locale, &r.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, r)
	}
	return out, total, rows.Err()
}
