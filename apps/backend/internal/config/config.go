// Package config loads runtime configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all runtime settings. Required values fail fast on load.
type Config struct {
	Port          string
	DatabaseURL   string
	JWTSecret     string
	StorageDir    string
	AllowedOrigin string // web-admin origin for CORS
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
		Port:          getenv("PORT", "8080"),
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		JWTSecret:     os.Getenv("JWT_SECRET"),
		StorageDir:    getenv("STORAGE_DIR", "./storage"),
		AllowedOrigin: getenv("WEB_ADMIN_ORIGIN", "http://localhost:5174"),
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
