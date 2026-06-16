// Package retention deletes screenshots past a business's retention window, both
// on demand and on a schedule. Files are removed before rows, and a missing file is
// not an error, so a partially-completed prior run self-heals on the next sweep.
package retention

import (
	"context"
	"log"
	"time"

	"ctracking/backend/internal/filestore"
	"ctracking/backend/internal/store"
)

// Service performs screenshot cleanup.
type Service struct {
	store *store.Store
	files *filestore.Store
}

// New builds a retention service.
func New(s *store.Store, f *filestore.Store) *Service {
	return &Service{store: s, files: f}
}

// Result reports what a cleanup removed.
type Result struct {
	Deleted    int64 `json:"deleted_count"`
	BytesFreed int64 `json:"bytes_freed"`
}

// CleanupBusiness deletes a business's screenshots older than olderThanDays. With 0,
// everything up to now is removed.
func (s *Service) CleanupBusiness(ctx context.Context, businessID string, olderThanDays int) (Result, error) {
	cutoff := time.Now().Unix() - int64(olderThanDays)*86400
	files, err := s.store.ScreenshotsBefore(ctx, businessID, cutoff)
	if err != nil {
		return Result{}, err
	}
	if len(files) == 0 {
		return Result{}, nil
	}

	ids := make([]int64, 0, len(files))
	var bytes int64
	for _, f := range files {
		// Remove the file first; a missing file is fine (Remove ignores ErrNotExist).
		if err := s.files.Remove(f.FilePath); err != nil {
			log.Printf("retention: remove %s: %v", f.FilePath, err)
			continue // leave the row so a later sweep retries this one
		}
		ids = append(ids, f.ID)
		bytes += int64(f.ByteSize)
	}

	deleted, err := s.store.DeleteScreenshotsByIDs(ctx, ids)
	if err != nil {
		return Result{}, err
	}
	return Result{Deleted: deleted, BytesFreed: bytes}, nil
}

// SweepAll applies each business's configured retention once.
func (s *Service) SweepAll(ctx context.Context) {
	businesses, err := s.store.BusinessesWithRetention(ctx)
	if err != nil {
		log.Printf("retention: list businesses: %v", err)
		return
	}
	for _, b := range businesses {
		res, err := s.CleanupBusiness(ctx, b.ID, b.Days)
		if err != nil {
			log.Printf("retention: cleanup business %s: %v", b.ID, err)
			continue
		}
		if res.Deleted > 0 {
			log.Printf("retention: business %s removed %d screenshots (%d bytes)", b.ID, res.Deleted, res.BytesFreed)
		}
	}
}

// StartSweeper runs an immediate sweep, then one every interval until ctx is done.
func (s *Service) StartSweeper(ctx context.Context, interval time.Duration) {
	go func() {
		s.SweepAll(ctx)
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.SweepAll(ctx)
			}
		}
	}()
}
