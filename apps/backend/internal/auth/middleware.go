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
