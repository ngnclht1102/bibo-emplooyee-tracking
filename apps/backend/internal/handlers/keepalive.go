package handlers

import (
	"crypto/subtle"
	"net/http"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/crypto/argon2"

	"github.com/gin-gonic/gin"
)

// KeepaliveHandler serves a deliberately CPU-heavy, side-effect-free endpoint used
// to keep an Oracle Always Free instance above the "idle" reclamation threshold
// (95th-percentile CPU < 20% over 7 days). It is NOT mounted under the rate-limited
// /auth group, and is gated by a static secret token so only the owner can call it.
type KeepaliveHandler struct {
	token string // shared secret; empty disables the endpoint entirely
}

// NewKeepaliveHandler wires the handler with the configured secret token.
func NewKeepaliveHandler(token string) *KeepaliveHandler {
	return &KeepaliveHandler{token: token}
}

// Enabled reports whether a token is configured (route is only registered when so).
func (h *KeepaliveHandler) Enabled() bool { return h.token != "" }

const (
	keepaliveDefaultSeconds = 30
	keepaliveMaxSeconds     = 120
)

// Burn pegs every CPU with argon2id for `seconds` (query/body param, default 30,
// capped 120). It allocates and discards work only — no DB, no state change.
func (h *KeepaliveHandler) Burn(c *gin.Context) {
	// Constant-time token check via the X-Keepalive-Token header.
	got := c.GetHeader("X-Keepalive-Token")
	if subtle.ConstantTimeCompare([]byte(got), []byte(h.token)) != 1 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid keepalive token"})
		return
	}

	seconds := keepaliveDefaultSeconds
	if v := c.Query("seconds"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			seconds = n
		}
	}
	if seconds > keepaliveMaxSeconds {
		seconds = keepaliveMaxSeconds
	}

	cpus := runtime.NumCPU()
	deadline := time.Now().Add(time.Duration(seconds) * time.Second)

	var hashes int64
	var wg sync.WaitGroup
	for i := 0; i < cpus; i++ {
		wg.Add(1)
		go func(seed int) {
			defer wg.Done()
			salt := []byte{byte(seed), 0xa5, 0x5a, 0xc3, 0x3c, 0x0f, 0xf0, 0x99}
			pw := []byte("keepalive")
			for time.Now().Before(deadline) {
				// argon2id: t=1, 64 MiB, p=4 — same cost profile as a real login.
				_ = argon2.IDKey(pw, salt, 1, 64*1024, 4, 32)
				atomic.AddInt64(&hashes, 1)
			}
		}(i)
	}
	wg.Wait()

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"cpus":    cpus,
		"seconds": seconds,
		"hashes":  hashes,
	})
}
