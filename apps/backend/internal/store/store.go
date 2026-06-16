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
	Email       string
	DisplayName string
}

// CreateUser inserts a user with the given argon2id hash. Email is lowercased.
// Returns ErrConflict if the email already exists.
func (s *Store) CreateUser(ctx context.Context, email, passwordHash, displayName string) (User, error) {
	email = normalizeEmail(email)
	var u User
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name)
		 VALUES ($1, $2, $3)
		 RETURNING id, email, display_name`,
		email, passwordHash, displayName,
	).Scan(&u.ID, &u.Email, &u.DisplayName)
	if isUniqueViolation(err) {
		return User{}, ErrConflict
	}
	if err != nil {
		return User{}, err
	}
	return u, nil
}

// GetUserByEmail returns the user and its password hash for login verification.
func (s *Store) GetUserByEmail(ctx context.Context, email string) (User, string, error) {
	email = normalizeEmail(email)
	var u User
	var hash string
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, display_name, password_hash FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &hash)
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
		`SELECT id, email, display_name FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.DisplayName)
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

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
