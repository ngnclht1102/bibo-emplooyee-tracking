package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"ctracking/backend/internal/obs"
	"ctracking/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// DownloadsHandler serves the installer files under <staticDir>/download and counts
// each hit. It's registered only when a static dir is configured (production).
type DownloadsHandler struct {
	store *store.Store
	dir   string
}

func NewDownloadsHandler(st *store.Store, staticDir string) *DownloadsHandler {
	return &DownloadsHandler{store: st, dir: staticDir}
}

// platformFor maps a public installer filename to a platform label, or "" if it's not
// a counted acquisition. Only the canonical downloads count — the NSIS .exe and
// .app.tar.gz are auto-update artifacts (re-fetched by existing installs) and the
// latest.json manifest is metadata, so none of those inflate the download totals.
func platformFor(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".dmg":
		return "macos"
	case ".msi":
		return "windows"
	default:
		return ""
	}
}

// Serve streams an installer and increments its download counter. Cache-Control:
// no-store keeps Cloudflare from serving the file from edge cache, so the origin
// sees (and counts) every download. Counting is best-effort — a DB hiccup must not
// block the download.
func (h *DownloadsHandler) Serve(c *gin.Context) {
	// Reject any path trickery — only a bare filename is allowed.
	name := c.Param("file")
	if name != filepath.Base(name) || name == "." || name == ".." {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad file"})
		return
	}
	full := filepath.Join(h.dir, "download", name)
	if fi, err := os.Stat(full); err != nil || fi.IsDir() {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	if platform := platformFor(name); platform != "" {
		if err := h.store.IncrementDownload(c.Request.Context(), name, platform); err != nil {
			obs.Warn("download count failed", "file", name, "err", err)
		}
	}

	c.Header("Cache-Control", "no-store")
	c.File(full)
}

// Stats returns the running download totals (public — aggregate counts only).
func (h *DownloadsHandler) Stats(c *gin.Context) {
	counts, err := h.store.DownloadCounts(c.Request.Context())
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"downloads": counts})
}
