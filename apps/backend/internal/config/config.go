// Package config loads runtime configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all runtime settings. Required values fail fast on load.
type Config struct {
	Port           string
	DatabaseURL    string
	JWTSecret      string
	StorageDir     string
	AllowedOrigin  string // web-admin origin for CORS
	StaticDir      string // dir of the built web-admin SPA to serve; "" = disabled
	SentryDSN      string // Sentry DSN; "" = error reporting disabled
	Environment    string // deploy env label sent to Sentry (local/staging/production)
	LogDir         string // dir for the on-disk log file (backend.log); "" = stdout only
	LogMaxSizeMB   int    // rotate the log file once it exceeds this size
	LogMaxBackups  int    // number of rotated files to keep
	LogMaxAgeDays  int    // delete rotated files older than this many days
	KeepaliveToken string // secret for the CPU keep-alive endpoint; "" = disabled
}

// Load reads .env (if present) then the process environment. It returns an error
// listing every missing required key so misconfiguration is obvious at boot.
func Load() (*Config, error) {
	// .env is optional; ignore a missing file but surface parse errors.
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		// godotenv returns a generic error when the file is absent; only the
		// presence of a malformed file matters, so we don't hard-fail here.
		_ = err
	}

	cfg := &Config{
		Port:           getenv("PORT", "8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		JWTSecret:      os.Getenv("JWT_SECRET"),
		StorageDir:     getenv("STORAGE_DIR", "./storage"),
		AllowedOrigin:  getenv("WEB_ADMIN_ORIGIN", "http://localhost:5174"),
		StaticDir:      os.Getenv("STATIC_DIR"),
		SentryDSN:      os.Getenv("SENTRY_DSN"),
		Environment:    getenv("APP_ENV", "local"),
		LogDir:         getenv("LOG_DIR", "./logs"),
		LogMaxSizeMB:   getenvInt("LOG_MAX_SIZE_MB", 50),
		LogMaxBackups:  getenvInt("LOG_MAX_BACKUPS", 5),
		LogMaxAgeDays:  getenvInt("LOG_MAX_AGE_DAYS", 30),
		KeepaliveToken: os.Getenv("KEEPALIVE_TOKEN"),
	}

	var missing []string
	if cfg.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if cfg.JWTSecret == "" {
		missing = append(missing, "JWT_SECRET")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required env: %s", strings.Join(missing, ", "))
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getenvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
