package handlers

import (
	"net/http"

	"ctracking/backend/internal/obs"

	"github.com/getsentry/sentry-go"
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"
)

func badRequest(c *gin.Context, msg string) {
	c.JSON(http.StatusBadRequest, gin.H{"error": msg})
}

func unauthorized(c *gin.Context, msg string) {
	c.JSON(http.StatusUnauthorized, gin.H{"error": msg})
}

// serverError logs the real error, reports it to Sentry (with request scope when
// available), and returns an opaque 500 to the client. Sentry is a no-op when unset.
func serverError(c *gin.Context, err error) {
	obs.Error("internal error", "err", err, "path", c.FullPath(), "method", c.Request.Method)
	if hub := sentrygin.GetHubFromContext(c); hub != nil {
		hub.CaptureException(err)
	} else {
		sentry.CaptureException(err)
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
}
