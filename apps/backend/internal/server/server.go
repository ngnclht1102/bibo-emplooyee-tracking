// Package server wires the router, middleware, and routes together.
package server

import (
	"ctracking/backend/internal/auth"
	"ctracking/backend/internal/config"
	"ctracking/backend/internal/filestore"
	"ctracking/backend/internal/handlers"
	"ctracking/backend/internal/middleware"
	"ctracking/backend/internal/retention"
	"ctracking/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// New builds the Gin engine with all routes registered. The store, file store, and
// retention service are shared with the caller (which also runs the retention sweeper).
func New(cfg *config.Config, st *store.Store, files *filestore.Store, ret *retention.Service) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), middleware.CORS(cfg.AllowedOrigin))

	r.GET("/healthz", handlers.Health)

	tok := auth.NewManager(cfg.JWTSecret)
	authH := handlers.NewAuthHandler(st, tok)
	ownerH := handlers.NewOwnerHandler(st)
	syncH := handlers.NewSyncHandler(st)
	shotH := handlers.NewScreenshotHandler(st, files)
	reportsH := handlers.NewReportsHandler(st, files)
	retentionH := handlers.NewRetentionHandler(st, ret)

	v1 := r.Group("/v1")

	// Public picker (no auth).
	v1.GET("/public/businesses", authH.PublicBusinesses)

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

	return r
}
