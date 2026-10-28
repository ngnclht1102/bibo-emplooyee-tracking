package auth

import (
	"net/http"
	"strings"

	"github.com/getsentry/sentry-go"
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"
)

const contextUserID = "user_id"

// Required is middleware that rejects requests without a valid access token and
// stores the authenticated user id in the context.
func (m *Manager) Required() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			return
		}
		userID, err := m.ParseAccess(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set(contextUserID, userID)
		// Tag this request's Sentry scope so any captured error/panic is attributed
		// to the authenticated user. No-op when Sentry is disabled (hub is nil).
		if hub := sentrygin.GetHubFromContext(c); hub != nil {
			hub.Scope().SetUser(sentry.User{ID: userID})
		}
		c.Next()
	}
}

// Optional is middleware for routes that are open to everyone but want to know
// who the caller is when they happen to be signed in. A missing or invalid token
// is not an error — the handler just sees no user id (ticket 160).
func (m *Manager) Optional() gin.HandlerFunc {
	return func(c *gin.Context) {
		token, ok := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
		if ok && token != "" {
			if userID, err := m.ParseAccess(token); err == nil {
				c.Set(contextUserID, userID)
			}
		}
		c.Next()
	}
}

// UserID returns the authenticated user id set by Required. The bool is false if
// the request was not authenticated.
func UserID(c *gin.Context) (string, bool) {
	v, ok := c.Get(contextUserID)
	if !ok {
		return "", false
	}
	id, ok := v.(string)
	return id, ok
}
