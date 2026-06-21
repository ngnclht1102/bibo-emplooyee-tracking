// Package obs is a thin structured-logging facade over log/slog, used on important
// flows (auth, sync, retention) so production logs are queryable. Sentry reporting for
// errors lives at the call sites (handlers.serverError); this is the log side.
//
// Never log secrets (tokens, passwords) or full page contents — ids/counts/durations only.
package obs

import (
	"log/slog"
	"os"
)

var logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

// Init installs a structured logger. Call once at startup. env labels every line so
// staging/prod logs are distinguishable when shipped to one place.
func Init(env string) {
	logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})).
		With("env", env)
}

func Info(msg string, args ...any)  { logger.Info(msg, args...) }
func Warn(msg string, args ...any)  { logger.Warn(msg, args...) }
func Error(msg string, args ...any) { logger.Error(msg, args...) }
