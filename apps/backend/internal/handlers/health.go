// Package handlers contains the HTTP route handlers.
package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Version is stamped at build time via -ldflags; defaults to "dev".
var Version = "dev"

// Health reports liveness and the build version.
func Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"version": Version,
	})
}
