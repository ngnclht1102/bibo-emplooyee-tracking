package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

// A missing asset must 404 and stay uncacheable. Serving the SPA shell instead puts
// a 200 text/html under a .js URL, which Cloudflare caches for hours and browsers
// refuse — the white screen that hit staging on 2026-11-07 (ticket 165).
func TestStaticSiteMissingAssetDoesNotFallBackToHTML(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	mustWrite(t, filepath.Join(dir, "index.html"), "<html>marketing</html>")
	mustWrite(t, filepath.Join(dir, "admin", "index.html"), "<html>admin spa</html>")
	mustWrite(t, filepath.Join(dir, "admin", "assets", "index-real.js"), "console.log(1)")

	r := gin.New()
	r.NoRoute(staticSite(dir))

	for _, tc := range []struct {
		name      string
		path      string
		wantCode  int
		wantBody  string
		wantNoCar bool // expect Cache-Control: no-store
	}{
		{"missing admin bundle 404s", "/admin/assets/index-gone.js", http.StatusNotFound, "", true},
		{"missing stylesheet 404s", "/admin/assets/index-gone.css", http.StatusNotFound, "", true},
		{"missing marketing image 404s", "/assets/hero.png", http.StatusNotFound, "", true},
		{"missing root asset by extension 404s", "/styles.css", http.StatusNotFound, "", true},
		{"existing bundle is served", "/admin/assets/index-real.js", http.StatusOK, "console.log(1)", false},
		{"admin client route gets the SPA", "/admin/internal/feedback", http.StatusOK, "<html>admin spa</html>", false},
		{"dotted client route still gets the SPA", "/admin/members/jane.doe", http.StatusOK, "<html>admin spa</html>", false},
		{"unknown page gets marketing", "/pricing", http.StatusOK, "<html>marketing</html>", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if w.Code != tc.wantCode {
				t.Fatalf("status = %d, want %d", w.Code, tc.wantCode)
			}
			if tc.wantBody != "" && w.Body.String() != tc.wantBody {
				t.Fatalf("body = %q, want %q", w.Body.String(), tc.wantBody)
			}
			if tc.wantCode == http.StatusNotFound {
				if ct := w.Header().Get("Content-Type"); ct != "" && ct[:9] == "text/html" {
					t.Fatalf("404 returned text/html (%q) — the poisoning bug is back", ct)
				}
				if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
					t.Fatalf("Cache-Control = %q, want no-store so the edge can't cache the miss", cc)
				}
			}
		})
	}
}

func mustWrite(t *testing.T, p, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}
