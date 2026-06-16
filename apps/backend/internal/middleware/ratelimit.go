package middleware

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// loginLimiter keeps a token-bucket rate limiter per client IP. It's an in-memory
// guard against credential brute-forcing; good enough for a single-instance backend.
type loginLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rate.Limiter
	rps     rate.Limit
	burst   int
}

// LoginRateLimit limits auth attempts per client IP. Defaults: ~1 req/sec with a
// burst of 5, which lets a human retry but throttles scripted guessing.
func LoginRateLimit() gin.HandlerFunc {
	l := &loginLimiter{
		buckets: make(map[string]*rate.Limiter),
		rps:     1,
		burst:   5,
	}
	return func(c *gin.Context) {
		if !l.limiterFor(c.ClientIP()).Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many attempts, slow down"})
			return
		}
		c.Next()
	}
}

func (l *loginLimiter) limiterFor(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()
	lim, ok := l.buckets[ip]
	if !ok {
		lim = rate.NewLimiter(l.rps, l.burst)
		l.buckets[ip] = lim
	}
	return lim
}
