// Package rollup keeps the activity_days table (daily per-person tracked time) in
// sync with activity_samples for the super-admin Business overview (ticket 149).
// A full rebuild takes a few seconds, so it simply rebuilds everything each run —
// late syncs from devices that were offline for days are picked up for free.
package rollup

import (
	"context"
	"time"

	"ctracking/backend/internal/obs"
	"ctracking/backend/internal/store"
)

// Start rebuilds once now, then every interval until ctx is done.
func Start(ctx context.Context, st *store.Store, interval time.Duration) {
	go func() {
		run(ctx, st)
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				run(ctx, st)
			}
		}
	}()
}

func run(ctx context.Context, st *store.Store) {
	began := time.Now()
	n, err := st.RebuildActivityDays(ctx)
	if err != nil {
		obs.Error("activity rollup failed", "err", err)
		return
	}
	obs.Info("activity rollup", "rows", n, "ms", time.Since(began).Milliseconds())
}
