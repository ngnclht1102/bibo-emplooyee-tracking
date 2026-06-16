// Command server is the ctracking backend HTTP entrypoint.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ctracking/backend/internal/config"
	"ctracking/backend/internal/db"
	"ctracking/backend/internal/filestore"
	"ctracking/backend/internal/retention"
	"ctracking/backend/internal/server"
	"ctracking/backend/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	if err := os.MkdirAll(cfg.StorageDir+"/screenshots", 0o755); err != nil {
		log.Fatalf("create storage dir: %v", err)
	}

	// Run migrations before opening the runtime pool so the schema is ready.
	if err := db.Migrate(cfg.DatabaseURL); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	st := store.New(pool)
	files := filestore.New(cfg.StorageDir)
	ret := retention.New(st, files)

	// Hourly screenshot retention sweep (plus one on startup).
	sweepCtx, stopSweeper := context.WithCancel(ctx)
	defer stopSweeper()
	ret.StartSweeper(sweepCtx, time.Hour)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: server.New(cfg, st, files, ret),
	}

	go func() {
		log.Printf("listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	// Graceful shutdown on SIGINT/SIGTERM.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
	log.Println("stopped")
}
