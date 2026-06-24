// Package server wires the router, middleware, and routes together.
package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"ctracking/backend/internal/auth"
	"ctracking/backend/internal/config"
	"ctracking/backend/internal/filestore"
	"ctracking/backend/internal/handlers"
	"ctracking/backend/internal/middleware"
	"ctracking/backend/internal/obs"
	"ctracking/backend/internal/retention"
	"ctracking/backend/internal/store"

	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"
)

// New builds the Gin engine with all routes registered. The store, file store, and
// retention service are shared with the caller (which also runs the retention sweeper).
func New(cfg *config.Config, st *store.Store, files *filestore.Store, ret *retention.Service) *gin.Engine {
	// Route gin's own output (access logs, route table, debug warnings) into the same
	// captured stream as obs/log so every line lands in the log file too.
	gin.DefaultWriter = obs.Writer()
	gin.DefaultErrorWriter = obs.Writer()

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), middleware.CORS(cfg.AllowedOrigin))

	// Report panics to Sentry (then re-panic so gin.Recovery still returns 500).
	// No-op when SENTRY_DSN is unset (the hub has no client).
	if cfg.SentryDSN != "" {
		r.Use(sentrygin.New(sentrygin.Options{Repanic: true}))
	}

	r.GET("/healthz", handlers.Health)

	tok := auth.NewManager(cfg.JWTSecret)
	authH := handlers.NewAuthHandler(st, tok)
	ownerH := handlers.NewOwnerHandler(st)
	syncH := handlers.NewSyncHandler(st)
	shotH := handlers.NewScreenshotHandler(st, files)
	reportsH := handlers.NewReportsHandler(st, files)
	retentionH := handlers.NewRetentionHandler(st, ret)
	downloadsH := handlers.NewDownloadsHandler(st, cfg.StaticDir)
	keepaliveH := handlers.NewKeepaliveHandler(cfg.KeepaliveToken)

	// Counted installer downloads (production, when static content is served). Takes
	// precedence over the static NoRoute fallback below.
	if cfg.StaticDir != "" {
		r.GET("/download/:file", downloadsH.Serve)
	}

	v1 := r.Group("/v1")

	// Public picker (no auth).
	v1.GET("/public/businesses", authH.PublicBusinesses)
	// Public download totals (aggregate counts only).
	v1.GET("/public/stats/downloads", downloadsH.Stats)

	// CPU keep-alive (token-gated, NOT rate-limited): keeps the Oracle Always Free
	// box above the idle-reclamation CPU threshold. Only mounted when a token is set.
	if keepaliveH.Enabled() {
		v1.POST("/keepalive", keepaliveH.Burn)
	}

	// Auth endpoints, rate-limited to throttle credential guessing.
	a := v1.Group("/auth", middleware.LoginRateLimit())
	a.POST("/register", authH.Register)
	a.POST("/login", authH.Login)
	a.POST("/refresh", authH.Refresh)

	// Protected routes. Owner/sync/report routes register under this group in
	// later tasks.
	authed := v1.Group("", tok.Required())
	authed.GET("/me", authH.Me)

	// Owner: business + employee management.
	authed.POST("/businesses", ownerH.CreateBusiness)
	authed.GET("/businesses/mine", ownerH.ListMine)
	authed.GET("/businesses/:id/employees", ownerH.ListEmployees)
	authed.PATCH("/businesses/:id/settings", ownerH.UpdateSettings)
	authed.POST("/businesses/:id/screenshots/cleanup", retentionH.Cleanup)
	authed.POST("/employees", ownerH.CreateEmployee)

	// Capture policy for the desktop (employee's org settings).
	authed.GET("/policy", ownerH.Policy)

	// Sync ingest (desktop → backend, one-directional).
	authed.POST("/sync/batch", syncH.Batch)
	authed.POST("/sync/screenshots", shotH.Upload)

	// Owner read path (reporting).
	authed.GET("/reports/employees", reportsH.Roster)
	authed.GET("/reports/employees/:id/activity", reportsH.Activity)
	authed.GET("/reports/employees/:id/keystrokes", reportsH.Keystrokes)
	authed.GET("/reports/employees/:id/browser", reportsH.Browser)
	authed.GET("/reports/employees/:id/screenshots", reportsH.Screenshots)
	authed.GET("/screenshots/:client_uuid", reportsH.ScreenshotImage)

	// Serve static content (same origin as the API) when configured:
	//   /         → marketing landing page (dir/index.html)
	//   /admin/*  → web-admin SPA       (dir/admin/index.html)
	if cfg.StaticDir != "" {
		r.NoRoute(staticSite(cfg.StaticDir))
	}

	return r
}

// staticSite serves files from dir. The marketing page lives at the root and the
// web-admin SPA under /admin: any unmatched /admin/* path falls back to the SPA's
// index.html for client-side routing, everything else to the marketing index.
// Unmatched API paths still return JSON 404s.
func staticSite(dir string) gin.HandlerFunc {
	marketingIndex := filepath.Join(dir, "index.html")
	adminIndex := filepath.Join(dir, "admin", "index.html")
	return func(c *gin.Context) {
		p := c.Request.URL.Path
		if p == "/healthz" || p == "/v1" || strings.HasPrefix(p, "/v1/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		file := filepath.Join(dir, filepath.Clean("/"+p))
		if fi, err := os.Stat(file); err == nil {
			if !fi.IsDir() {
				c.File(file)
				return
			}
			// Directory request (e.g. a locale page like /zh/): serve its index.html
			// if present, so localized pages aren't swallowed by the root fallback.
			if idx := filepath.Join(file, "index.html"); idx != marketingIndex {
				if fi2, err2 := os.Stat(idx); err2 == nil && !fi2.IsDir() {
					c.File(idx)
					return
				}
			}
		}
		if p == "/admin" || strings.HasPrefix(p, "/admin/") {
			c.File(adminIndex)
			return
		}
		c.File(marketingIndex)
	}
}
