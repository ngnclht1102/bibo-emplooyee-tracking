# 125 — Extension error reporting → desktop → Sentry

**Status:** Done
**Type:** Implementation

## Goal
The extension has no build step and zero deps (can't bundle the Sentry SDK in an MV3
service worker cleanly). Instead, when the extension catches an error, it POSTs a small
error report to the **local desktop app**, which forwards it to Sentry via the Rust SDK
(landed in 124). Keeps the extension dependency-free and routes errors through one place.

## Design
### New desktop endpoint (`apps/desktop/src-tauri/src/server/mod.rs`)
- `POST /report-error`, token-protected with the same `x-ctracking-token` + origin guard
  as `/ingest`.
- Body:
  ```rust
  struct ErrorIn {
      message: String,
      #[serde(default)] stack: Option<String>,
      #[serde(default)] context: Option<String>, // e.g. "postVisit", "discover"
      #[serde(default)] url: Option<String>,
  }
  ```
- Handler calls `crate::obs::capture_message(...)` (from 124) building a Sentry event
  tagged `source = "extension"`, with `stack`/`context`/`url` as extra data. Returns 200.
- Rate-limit defensively (e.g. drop if >N/min) so a looping extension error can't flood
  Sentry — simple in-memory counter on `AppState`.

### Extension (`apps/extension/background.js`, `popup.js`)
- Add a tiny `reportError(err, context)` helper that `postVisit`-style discovers the link
  and POSTs to `/report-error` (best-effort; swallow its own failures — never recurse).
- Replace the silent `catch (_) {}` blocks (tab events, focus, postVisit catch, popup
  hostname parse) with `catch (e) { reportError(e, "<context>"); }` where a real bug
  would otherwise vanish. Keep "expected" connection-refused paths quiet (app closed is
  normal) — only report unexpected errors.
- Optional: `self.addEventListener("error", ...)` / `"unhandledrejection"` in the service
  worker to catch stray throws.

## Verify
- Run desktop dev (with Rust DSN set) + load extension.
- Force an error (temp `throw` in a tab handler) → desktop receives `POST /report-error`
  → event in the desktop-Rust Sentry project tagged `source=extension`.
- With desktop app closed, extension's `reportError` fails silently (no console spam, no
  retry storm).
