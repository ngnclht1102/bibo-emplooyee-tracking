package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Token kinds. Access tokens authorize API calls; refresh tokens mint new access
// tokens. Each token carries its kind so one can't be used in place of the other.
const (
	kindAccess  = "access"
	kindRefresh = "refresh"
)

const (
	accessTTL  = 15 * time.Minute
	refreshTTL = 30 * 24 * time.Hour
)

// ErrInvalidToken is returned for any malformed, expired, or wrong-kind token.
var ErrInvalidToken = errors.New("invalid token")

// Manager issues and verifies JWTs with a shared secret.
type Manager struct {
	secret []byte
}

// NewManager builds a token manager from the configured signing secret.
func NewManager(secret string) *Manager {
	return &Manager{secret: []byte(secret)}
}

type claims struct {
	Kind string `json:"kind"`
	jwt.RegisteredClaims
}

// TokenPair is what login/refresh return to the client.
type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"` // access token lifetime, seconds
}

// Issue mints a fresh access + refresh pair for the given user id.
func (m *Manager) Issue(userID string) (TokenPair, error) {
	access, err := m.sign(userID, kindAccess, accessTTL)
	if err != nil {
		return TokenPair{}, err
	}
	refresh, err := m.sign(userID, kindRefresh, refreshTTL)
	if err != nil {
		return TokenPair{}, err
	}
	return TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int(accessTTL.Seconds()),
	}, nil
}

func (m *Manager) sign(userID, kind string, ttl time.Duration) (string, error) {
	now := time.Now()
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims{
		Kind: kind,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	})
	return t.SignedString(m.secret)
}

// ParseAccess validates an access token and returns its user id.
func (m *Manager) ParseAccess(token string) (string, error) {
	return m.parse(token, kindAccess)
}

// ParseRefresh validates a refresh token and returns its user id.
func (m *Manager) ParseRefresh(token string) (string, error) {
	return m.parse(token, kindRefresh)
}

func (m *Manager) parse(token, wantKind string) (string, error) {
	c := &claims{}
	parsed, err := jwt.ParseWithClaims(token, c, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return m.secret, nil
	})
	if err != nil || !parsed.Valid || c.Kind != wantKind || c.Subject == "" {
		return "", ErrInvalidToken
	}
	return c.Subject, nil
}
