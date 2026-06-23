// Package obs is a thin structured-logging facade over log/slog, used on important
// flows (auth, sync, retention) so production logs are queryable. Sentry reporting for
// errors lives at the call sites (handlers.serverError); this is the log side.
//
// Logs fan out to BOTH stdout (as before) and a file on disk, in a single ordered
// stream. The stdlib log package is redirected to the same sink, so plain log.Printf
// calls (e.g. in cmd/server) are captured alongside slog output.
//
// Never log secrets (tokens, passwords) or full page contents — ids/counts/durations only.
package obs

import (
	"io"
	"log"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/natefinch/lumberjack.v2"
)

// FileConfig controls the on-disk log file and its rotation. A zero Dir disables file
// logging (stdout only); zero rotation values fall back to lumberjack's own defaults.
type FileConfig struct {
	Dir        string // directory for backend.log; "" = stdout only
	MaxSizeMB  int    // rotate once the active file exceeds this many megabytes
	MaxBackups int    // how many rotated files to keep
	MaxAgeDays int    // delete rotated files older than this many days
}

// syncWriter serializes every write from every log source (slog AND the stdlib log
// package) through one mutex. This is what prevents the race: when many goroutines log
// at once, the lock guarantees (a) no two records interleave their bytes, and (b) the
// on-disk order matches the real-time order in which Write was called. slog buffers a
// full record before issuing a single Write, so each Lock/Unlock spans exactly one line.
type syncWriter struct {
	mu sync.Mutex
	w  io.Writer
}

func (s *syncWriter) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.w.Write(p)
}

var (
	logger  = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	logFile io.Closer
	shared  io.Writer = os.Stdout // the mutex-guarded sink; see Writer
)

// Writer returns the shared, mutex-guarded sink (stdout + rotating file). Point any other
// library that writes its own logs (e.g. gin.DefaultWriter) at this so its output is
// captured in the same ordered, race-safe stream. Valid after Init; before that it's stdout.
func Writer() io.Writer { return shared }

// Init installs a structured logger that writes to both stdout and fc.Dir/backend.log,
// and redirects the stdlib log package to the same sink so every line is captured in one
// ordered stream. The file is size-rotated by lumberjack (old files compressed). env
// labels every line so staging/prod logs are distinguishable when shipped to one place.
// Call once at startup; call Close at shutdown. A failure to prepare the log directory is
// non-fatal: logging falls back to stdout-only and the error is returned.
func Init(env string, fc FileConfig) error {
	var sink io.Writer = os.Stdout
	var openErr error

	if fc.Dir != "" {
		if err := os.MkdirAll(fc.Dir, 0o755); err != nil {
			openErr = err
		} else {
			lj := &lumberjack.Logger{
				Filename:   filepath.Join(fc.Dir, "backend.log"),
				MaxSize:    fc.MaxSizeMB,  // megabytes before rotating
				MaxBackups: fc.MaxBackups, // rotated files to retain
				MaxAge:     fc.MaxAgeDays, // days to retain rotated files
				Compress:   true,          // gzip rotated files
			}
			logFile = lj
			sink = io.MultiWriter(os.Stdout, lj)
		}
	}

	// One shared, mutex-guarded sink shared by slog, stdlib log, and (via Writer) gin →
	// no interleaving, correct time ordering across all sources.
	shared = &syncWriter{w: sink}

	logger = slog.New(slog.NewJSONHandler(shared, &slog.HandlerOptions{Level: slog.LevelInfo})).
		With("env", env)

	// Capture plain log.Printf/Println output (cmd/server uses it) into the same stream.
	// slog already stamps each record with an RFC3339 time, but stdlib lines are plain
	// text, so keep a timestamp prefix on them for ordering when eyeballing the file.
	log.SetOutput(shared)
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	return openErr
}

// Close flushes and closes the log file. Safe to call even if Init used stdout only.
func Close() error {
	if logFile != nil {
		err := logFile.Close()
		logFile = nil
		return err
	}
	return nil
}

func Info(msg string, args ...any)  { logger.Info(msg, args...) }
func Warn(msg string, args ...any)  { logger.Warn(msg, args...) }
func Error(msg string, args ...any) { logger.Error(msg, args...) }
