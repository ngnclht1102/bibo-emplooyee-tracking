// Package server wires the router, middleware, and routes together.
package server

import (
	"net/http"
	"os"
	"path"
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
	authH := handlers.NewAuthHandler(st, tok, cfg.SuperAdmins)
	ownerH := handlers.NewOwnerHandler(st)
	syncH := handlers.NewSyncHandler(st)
	shotH := handlers.NewScreenshotHandler(st, files)
	reportsH := handlers.NewReportsHandler(st, files)
	retentionH := handlers.NewRetentionHandler(st, ret)
	downloadsH := handlers.NewDownloadsHandler(st, cfg.StaticDir)
	keepaliveH := handlers.NewKeepaliveHandler(cfg.KeepaliveToken)
	messagesH := handlers.NewMessagesHandler(st, cfg.JWTSecret)
	adminMsgH := handlers.NewAdminMessagesHandler(st)
	adminOverviewH := handlers.NewAdminOverviewHandler(st)
	billingH := handlers.NewBillingHandler(st)
	feedbackH := handlers.NewFeedbackHandler(st)

	// Counted installer downloads (production, when static content is served). Takes
	// precedence over the static NoRoute fallback below.
	if cfg.StaticDir != "" {
		r.GET("/download/:file", downloadsH.Serve)
	}

	v1 := r.Group("/v1")

	// Public picker (no auth).
	// Public download totals (aggregate counts only).
	v1.GET("/public/stats/downloads", downloadsH.Stats)
	// Curated sensitive-app list for screenshot privacy mode / skip-list
	// suggestions (public: the desktop needs it in personal mode too).
	v1.GET("/public/screenshot-privacy-apps", handlers.PrivacyApps)

	// CPU keep-alive (token-gated, NOT rate-limited): keeps the Oracle Always Free
	// box above the idle-reclamation CPU threshold. Only mounted when a token is set.
	if keepaliveH.Enabled() {
		v1.POST("/keepalive", keepaliveH.Burn)
	}

	// Desktop "Send feedback" (ticket 160). Public + rate-limited: personal-mode
	// apps have no account, so anyone can write in; auth.Optional links the row to
	// the sender's user when they happen to be signed in.
	v1.POST("/feedback", middleware.FeedbackRateLimit(), tok.Optional(), feedbackH.Submit)

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
	authed.PATCH("/businesses/:id/employees/:employeeID", ownerH.UpdateEmployee)
	authed.DELETE("/businesses/:id/employees/:employeeID", ownerH.RemoveEmployee)

	// Capture policy for the desktop (employee's org settings).
	authed.GET("/policy", ownerH.Policy)

	// The caller's own feedback and the super-admin replies to it (ticket 165),
	// plus marking those replies read. Signed-in only: a personal-mode submission
	// has no account to answer.
	authed.GET("/feedback/mine", feedbackH.Mine)
	authed.POST("/feedback/mine/seen", feedbackH.MarkMineSeen)

	// In-app messages for the desktop (announcements, surveys, promos).
	authed.GET("/messages", messagesH.List)
	authed.POST("/messages/:id/response", messagesH.Respond)
	authed.POST("/messages/:id/events", messagesH.Event)

	// Super-admin area (SUPER_ADMINS): in-app messages + their analytics, and the
	// Business overview (ticket 149).
	admin := authed.Group("/admin", handlers.SuperAdmin(st, cfg.SuperAdmins))
	admin.GET("/messages", adminMsgH.List)
	admin.POST("/messages", adminMsgH.Create)
	admin.GET("/messages/:id", adminMsgH.Get)
	admin.PUT("/messages/:id", adminMsgH.Update)
	admin.DELETE("/messages/:id", adminMsgH.Delete)
	admin.GET("/messages/:id/stats", adminMsgH.Stats)
	admin.GET("/users", adminMsgH.Users)
	admin.GET("/overview", adminOverviewH.Get)
	admin.GET("/feedback", feedbackH.List)
	admin.POST("/feedback/:id/reply", feedbackH.Reply)

	// Billing (tickets 152, 159). Owners: web-admin, one team workspace at a time.
	bill := authed.Group("/businesses/:id/billing", billingH.OwnerOnly())
	bill.GET("/settings", billingH.GetSettings)
	bill.PUT("/settings", billingH.UpdateSettings)
	bill.GET("/members", billingH.Members)
	bill.GET("/rates", billingH.Rates)
	bill.POST("/rates", billingH.SetRate)
	bill.DELETE("/rates/:rid", billingH.DeleteRate)
	bill.GET("/projects", billingH.Projects)
	bill.POST("/projects", billingH.SaveProject)
	bill.PUT("/projects/:pid", billingH.SaveProject)
	bill.DELETE("/projects/:pid", billingH.DeleteProject)
	bill.GET("/tasks", billingH.Tasks)
	bill.POST("/tasks", billingH.SaveTask)
	bill.PUT("/tasks/:tid", billingH.SaveTask)
	bill.GET("/tasks/:tid/detail", billingH.TaskDetail)
	bill.DELETE("/tasks/:tid", billingH.DeleteTask)
	bill.GET("/entries", billingH.Entries)
	bill.POST("/entries", billingH.SaveEntry)
	bill.PUT("/entries/:eid", billingH.SaveEntry)
	bill.DELETE("/entries/:eid", billingH.DeleteEntry)
	bill.GET("/tracked", billingH.Tracked)
	// Invoices come from the members (ticket 159); the owner reads them, records
	// payment, voids, and can clear a draft that is holding time.
	bill.GET("/invoices", billingH.Invoices)
	bill.GET("/invoices/:iid", billingH.GetInvoice)
	bill.PATCH("/invoices/:iid", billingH.UpdateInvoice)
	bill.DELETE("/invoices/:iid", billingH.DeleteInvoice)

	// Billing for every member, from the desktop: tasks, their own time, and the
	// invoices they raise against the workspace (ticket 159).
	work := authed.Group("/work", billingH.Member())
	work.GET("/context", billingH.Context)
	work.POST("/tasks", billingH.SaveTask)
	work.PUT("/tasks/:tid", billingH.SaveTask)
	work.GET("/entries", billingH.Entries)
	work.POST("/entries", billingH.SaveEntry)
	work.PUT("/entries/:eid", billingH.SaveEntry)
	work.DELETE("/entries/:eid", billingH.DeleteEntry)
	work.PUT("/billing-details", billingH.SetMyBillingDetails)
	work.GET("/invoices", billingH.Invoices)
	work.POST("/invoices/preview", billingH.PreviewInvoice)
	work.POST("/invoices", billingH.CreateInvoice)
	work.GET("/invoices/:iid", billingH.GetInvoice)
	work.PATCH("/invoices/:iid", billingH.UpdateInvoice)
	work.DELETE("/invoices/:iid", billingH.DeleteInvoice)

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
//
// A missing *asset* (hashed bundle, image, font…) is the one case that must NOT get
// that HTML fallback: it would be a 200 text/html under a .js URL, which Cloudflare
// caches for hours and browsers then refuse ("Expected a JavaScript module but the
// server responded with MIME type text/html") — a white screen that outlives the
// deploy. `rsync --delete` makes this reachable on every deploy, and it took down
// staging on 2026-11-07. Assets 404 instead, uncacheable, so the gap self-heals.
func staticSite(dir string) gin.HandlerFunc {
	marketingIndex := filepath.Join(dir, "index.html")
	adminIndex := filepath.Join(dir, "admin", "index.html")
	// serve sends a file, forcing HTML to revalidate every load so a deploy takes
	// effect immediately (browsers otherwise heuristically cache HTML that carries
	// no Cache-Control and keep serving the stale page even on refresh). Cache-busted
	// assets (styles.css?v=, hashed JS/CSS) and latest.json keep their default behaviour.
	serve := func(c *gin.Context, file string) {
		if strings.HasSuffix(file, ".html") {
			c.Header("Cache-Control", "no-cache")
		}
		c.File(file)
	}
	return func(c *gin.Context) {
		p := c.Request.URL.Path
		if p == "/healthz" || p == "/v1" || strings.HasPrefix(p, "/v1/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		file := filepath.Join(dir, filepath.Clean("/"+p))
		if fi, err := os.Stat(file); err == nil {
			if !fi.IsDir() {
				serve(c, file)
				return
			}
			// Directory request (e.g. a locale page like /zh/): serve its index.html
			// if present, so localized pages aren't swallowed by the root fallback.
			if idx := filepath.Join(file, "index.html"); idx != marketingIndex {
				if fi2, err2 := os.Stat(idx); err2 == nil && !fi2.IsDir() {
					serve(c, idx)
					return
				}
			}
		}
		if isAssetPath(p) {
			c.Header("Cache-Control", "no-store")
			c.Status(http.StatusNotFound)
			return
		}
		if p == "/admin" || strings.HasPrefix(p, "/admin/") {
			serve(c, adminIndex)
			return
		}
		serve(c, marketingIndex)
	}
}

// assetExts are the static types an SPA/marketing page pulls in. A request for one
// of these that isn't on disk is a genuine 404, never a client-side route.
var assetExts = map[string]bool{
	".js": true, ".mjs": true, ".css": true, ".map": true,
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".svg": true, ".webp": true,
	".ico": true, ".avif": true, ".mp4": true, ".webm": true,
	".woff": true, ".woff2": true, ".ttf": true, ".otf": true, ".eot": true,
	".json": true, ".txt": true, ".xml": true, ".wasm": true,
}

// isAssetPath reports whether p addresses a static asset rather than a client route.
// Matching on a known extension (not merely "has a dot") keeps routes like
// /admin/members/jane.doe falling through to the SPA.
func isAssetPath(p string) bool {
	if strings.HasPrefix(p, "/admin/assets/") || strings.HasPrefix(p, "/assets/") {
		return true
	}
	return assetExts[strings.ToLower(path.Ext(p))]
}
