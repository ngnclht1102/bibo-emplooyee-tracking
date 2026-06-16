# 55 — Desktop: WebP screenshot compression (≤50 KB)

- **Phase:** 5
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 19
- **Blocks:** —

## Goal
Every screenshot is ≤50 KB before it's stored/uploaded, per
[docs/11-backend-and-sync.md](../docs/11-backend-and-sync.md).

## Scope
- At capture: downscale to a max long-edge (~1366 px), encode **WebP** (~q55).
- Target-size loop: if > 50 KB, step quality down (q45 → q35 → q25), then resolution
  (1366 → 1152 → 960); hard floor (q20 / 960 px) to bound the loop.
- Optional grayscale knob.
- The ≤50 KB file is what's written locally **and** later uploaded — single encode.
- Replace the existing PNG path; keep per-display capture.

## Acceptance criteria
- [ ] Every produced file is ≤50 KB (verify across single/multi-monitor, busy screens).
- [ ] Images remain legible at the chosen size.
- [ ] Loop terminates at the floor for worst-case screens without hanging.
- [ ] Stored file == uploaded file (no second compression).
- [ ] Capture cadence/perf unaffected.
