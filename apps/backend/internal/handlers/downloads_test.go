package handlers

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

// A missing installer must still forbid caching: Cloudflare otherwise applies its own
// default TTL (4h) to the 404 and keeps serving "not found" after the file is staged.
func TestServeSetsNoStoreOnEveryReply(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "download"), 0o755); err != nil {
		t.Fatal(err)
	}
	// An uncounted name (latest.json), so the test needs no store for the hit path.
	if err := os.WriteFile(filepath.Join(dir, "download", "latest.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	h := NewDownloadsHandler(nil, dir)
	r := gin.New()
	r.GET("/download/:file", h.Serve)

	cases := []struct {
		name string
		path string
		want int
	}{
		{"missing file", "/download/Nope.msi", http.StatusNotFound},
		{"path trickery", "/download/..", http.StatusBadRequest},
		{"present file", "/download/latest.json", http.StatusOK},
	}
	for _, c := range cases {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, c.path, nil))
		if w.Code != c.want {
			t.Errorf("%s: status %d want %d", c.name, w.Code, c.want)
		}
		if got := w.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s: Cache-Control %q want %q", c.name, got, "no-store")
		}
	}
}
