package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// ErrForbidden is returned when a user acts on a business they don't own.
var ErrForbidden = errors.New("forbidden")

// Business is a company/team owned by a user.
type Business struct {
	ID                      string `json:"id"`
	Name                    string `json:"name"`
	OwnerUserID             string `json:"owner_user_id"`
	ScreenshotRetentionDays *int   `json:"screenshot_retention_days"`
}

// Employee is a member with the employee role within a business.
type Employee struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
}

// CreateBusiness creates a business and the owner membership in one transaction.
func (s *Store) CreateBusiness(ctx context.Context, ownerID, name string) (Business, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Business{}, err
	}
	defer tx.Rollback(ctx)

	biz, err := createBusinessTx(ctx, tx, ownerID, name)
	if err != nil {
		return Business{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Business{}, err
	}
	return biz, nil
}

// ListBusinessesOwnedBy returns the businesses a user owns.
func (s *Store) ListBusinessesOwnedBy(ctx context.Context, ownerID string) ([]Business, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, owner_user_id, screenshot_retention_days
		   FROM businesses WHERE owner_user_id = $1 ORDER BY created_at`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Business{}
	for rows.Next() {
		var b Business
		if err := rows.Scan(&b.ID, &b.Name, &b.OwnerUserID, &b.ScreenshotRetentionDays); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// GetBusiness returns a business by id.
func (s *Store) GetBusiness(ctx context.Context, id string) (Business, error) {
	return getBusiness(ctx, s.pool, id)
}

// CreateEmployee creates an employee account + employee membership. If businessID is
// nil, the employee is placed in the owner's first business, auto-creating a default
// business ("<owner>'s Team") when the owner has none. If businessID is set, the
// caller must own that business. All in one transaction.
func (s *Store) CreateEmployee(ctx context.Context, ownerID string, businessID *string, email, passwordHash, displayName string) (Employee, Business, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Employee{}, Business{}, err
	}
	defer tx.Rollback(ctx)

	var biz Business
	if businessID != nil {
		biz, err = getBusiness(ctx, tx, *businessID)
		if err != nil {
			return Employee{}, Business{}, err
		}
		if biz.OwnerUserID != ownerID {
			return Employee{}, Business{}, ErrForbidden
		}
	} else {
		biz, err = firstOwnedBusinessTx(ctx, tx, ownerID)
		if errors.Is(err, ErrNotFound) {
			// Skip-business flow: auto-create a default business for this owner.
			var ownerName string
			if err := tx.QueryRow(ctx, `SELECT display_name FROM users WHERE id = $1`, ownerID).
				Scan(&ownerName); err != nil {
				return Employee{}, Business{}, err
			}
			biz, err = createBusinessTx(ctx, tx, ownerID, ownerName+"'s Team")
		}
		if err != nil {
			return Employee{}, Business{}, err
		}
	}

	email = normalizeEmail(email)
	var emp Employee
	err = tx.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name)
		 VALUES ($1, $2, $3) RETURNING id, email, display_name`,
		email, passwordHash, displayName,
	).Scan(&emp.ID, &emp.Email, &emp.DisplayName)
	if isUniqueViolation(err) {
		return Employee{}, Business{}, ErrConflict
	}
	if err != nil {
		return Employee{}, Business{}, err
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, 'employee')`,
		emp.ID, biz.ID,
	); err != nil {
		return Employee{}, Business{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Employee{}, Business{}, err
	}
	return emp, biz, nil
}

// ListEmployees returns the employee members of a business.
func (s *Store) ListEmployees(ctx context.Context, businessID string) ([]Employee, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT u.id, u.email, u.display_name
		   FROM memberships m
		   JOIN users u ON u.id = m.user_id
		  WHERE m.business_id = $1 AND m.role = 'employee'
		  ORDER BY u.display_name`, businessID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Employee{}
	for rows.Next() {
		var e Employee
		if err := rows.Scan(&e.ID, &e.Email, &e.DisplayName); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// UpdateRetention sets a business's screenshot retention (nil = keep forever).
func (s *Store) UpdateRetention(ctx context.Context, businessID string, days *int) error {
	ct, err := s.pool.Exec(ctx,
		`UPDATE businesses SET screenshot_retention_days = $2 WHERE id = $1`,
		businessID, days)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// --- transaction-scoped helpers (work with both *pgxpool.Pool and pgx.Tx) ---

// rowQuerier is satisfied by *pgxpool.Pool and pgx.Tx.
type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func getBusiness(ctx context.Context, q rowQuerier, id string) (Business, error) {
	var b Business
	err := q.QueryRow(ctx,
		`SELECT id, name, owner_user_id, screenshot_retention_days FROM businesses WHERE id = $1`, id,
	).Scan(&b.ID, &b.Name, &b.OwnerUserID, &b.ScreenshotRetentionDays)
	if errors.Is(err, pgx.ErrNoRows) {
		return Business{}, ErrNotFound
	}
	if err != nil {
		return Business{}, err
	}
	return b, nil
}

func firstOwnedBusinessTx(ctx context.Context, tx pgx.Tx, ownerID string) (Business, error) {
	var b Business
	err := tx.QueryRow(ctx,
		`SELECT id, name, owner_user_id, screenshot_retention_days
		   FROM businesses WHERE owner_user_id = $1 ORDER BY created_at LIMIT 1`, ownerID,
	).Scan(&b.ID, &b.Name, &b.OwnerUserID, &b.ScreenshotRetentionDays)
	if errors.Is(err, pgx.ErrNoRows) {
		return Business{}, ErrNotFound
	}
	if err != nil {
		return Business{}, err
	}
	return b, nil
}

func createBusinessTx(ctx context.Context, tx pgx.Tx, ownerID, name string) (Business, error) {
	var b Business
	err := tx.QueryRow(ctx,
		`INSERT INTO businesses (name, owner_user_id) VALUES ($1, $2)
		 RETURNING id, name, owner_user_id, screenshot_retention_days`,
		name, ownerID,
	).Scan(&b.ID, &b.Name, &b.OwnerUserID, &b.ScreenshotRetentionDays)
	if err != nil {
		return Business{}, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, 'owner')`,
		ownerID, b.ID,
	); err != nil {
		return Business{}, err
	}
	return b, nil
}
