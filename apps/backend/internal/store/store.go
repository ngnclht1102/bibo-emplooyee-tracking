// Package store is the data-access layer over Postgres.
package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a lookup matches no row.
var ErrNotFound = errors.New("not found")

// ErrConflict is returned on a unique-constraint violation (e.g. duplicate email).
var ErrConflict = errors.New("conflict")

// Store wraps the connection pool.
type Store struct {
	pool *pgxpool.Pool
}

// New builds a Store over the given pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// User is an application account.
type User struct {
	ID          string
	Email       string // may be empty for members who log in by username
	Username    string // may be empty for owners who log in by email
	DisplayName string
	AccountType string // 'manager' | 'parent' (default 'manager')
}

// CreateUser inserts a user with the given argon2id hash. email/username are
// lowercased; pass "" for whichever is unused (at least one must be set, enforced
// by the caller + a DB CHECK). accountType selects the persona ('manager' |
// 'parent'); pass "" to default to 'manager'. Returns ErrConflict on a duplicate
// email or username.
func (s *Store) CreateUser(ctx context.Context, email, username, passwordHash, displayName, accountType string) (User, error) {
	if accountType == "" {
		accountType = "manager"
	}
	var u User
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users (email, username, password_hash, display_name, account_type)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, COALESCE(email, ''), COALESCE(username, ''), display_name, account_type`,
		nullableLower(email), nullableLower(username), passwordHash, displayName, accountType,
	).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AccountType)
	if isUniqueViolation(err) {
		return User{}, ErrConflict
	}
	if err != nil {
		return User{}, err
	}
	return u, nil
}

// GetUserByIdentifier returns the user and its password hash for login. The
// identifier matches either the email or the username (both stored lowercased).
func (s *Store) GetUserByIdentifier(ctx context.Context, identifier string) (User, string, error) {
	identifier = normalizeEmail(identifier) // lowercase + trim; usernames are lowercased too
	var u User
	var hash string
	err := s.pool.QueryRow(ctx,
		`SELECT id, COALESCE(email, ''), COALESCE(username, ''), display_name, account_type, password_hash
		   FROM users WHERE email = $1 OR username = $1`,
		identifier,
	).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AccountType, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", ErrNotFound
	}
	if err != nil {
		return User{}, "", err
	}
	return u, hash, nil
}

// GetUserByID returns the user by id (without the password hash).
func (s *Store) GetUserByID(ctx context.Context, id string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`SELECT id, COALESCE(email, ''), COALESCE(username, ''), display_name, account_type FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AccountType)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	return u, nil
}

// IsMember reports whether the user belongs to the business.
func (s *Store) IsMember(ctx context.Context, userID, businessID string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM memberships WHERE user_id = $1 AND business_id = $2)`,
		userID, businessID,
	).Scan(&exists)
	return exists, err
}

// PublicBusiness is the minimal business info shown on the login picker.
type PublicBusiness struct {
	BusinessID string `json:"business_id"`
	Name       string `json:"name"`
	OwnerName  string `json:"owner_name"`
}

// ListPublicBusinesses returns all businesses with their owner's display name,
// for the unauthenticated login picker.
func (s *Store) ListPublicBusinesses(ctx context.Context) ([]PublicBusiness, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT b.id, b.name, u.display_name
		   FROM businesses b
		   JOIN users u ON u.id = b.owner_user_id
		  ORDER BY b.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []PublicBusiness{}
	for rows.Next() {
		var b PublicBusiness
		if err := rows.Scan(&b.BusinessID, &b.Name, &b.OwnerName); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// nullableLower lowercases/trims an identifier, returning nil (SQL NULL) when blank
// so unique indexes don't collide on empty strings.
func nullableLower(s string) any {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return nil
	}
	return s
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
