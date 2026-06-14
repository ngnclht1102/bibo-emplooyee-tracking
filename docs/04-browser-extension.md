# Browser extension + local ingest

Window titles alone can't give real URLs or per-page timing inside single-page
apps. So browser tracking uses a small **browser extension** that reports the
active tab to the Tauri app over localhost.

## Why an extension

- Window title gives only the page *title* ("Inbox - Gmail"), never the URL.
- SPAs change pages without changing the window/title, so time-per-page is invisible
  from the OS side.
- The extension's `tabs`/`webNavigation` APIs give accurate URL + activation events.

## Flow

```
Browser (Chrome/Edge)                 Tauri app (Rust)
┌───────────────────────┐             ┌─────────────────────────┐
│ background service     │  POST       │ axum server             │
│ worker:                │  /ingest    │ 127.0.0.1:<port>        │
│  - onActivated         │ ──────────▶ │  validates + writes     │
│  - onUpdated           │  {url,title,│  browser_visit rows     │
│  - onFocusChanged      │   ts,browser}│                        │
│  diff timestamps →     │             │                         │
│  duration per page     │             └─────────────────────────┘
└───────────────────────┘
```

## Extension responsibilities

- Listen to `chrome.tabs.onActivated`, `chrome.tabs.onUpdated`,
  `chrome.windows.onFocusChanged`.
- Track the currently-active tab and timestamp; when it changes, compute the
  duration on the previous page and POST a `browser_visit` record.
- Only report when the browser window is focused (avoid counting background time).
- Manifest V3 service worker; minimal permissions (`tabs`, host access).

## Transport decision (locked)

**Use localhost HTTP for v1.** The extension `POST`s to an `axum` server on
`127.0.0.1:<port>` with a shared-secret header. Chrome **Native Messaging** (helper
binary over stdin/stdout) is the more hardened alternative but needs a per-browser
native-host manifest with a hardcoded extension ID — deferred as a later hardening
step, not v1.

## Port selection, conflict fallback & auto-discovery

The app can't assume a fixed port is free, and the extension can't read a config file
from disk — so both sides share a **fixed candidate list** and the extension probes it.

### Candidate ports

Chosen from the high registered range, away from common dev/app/macOS ports (avoids
3000/5000/7000/8080 etc. — note macOS uses 5000/7000 for AirPlay/Control Center).
Spread out so a single conflicting app can't knock out several at once:

```
47615, 48291, 49377, 50603, 51719, 52837
```

Stored as a single shared constant used by **both** the Rust app and the extension.

### App side (bind with fallback)

1. On startup, try to bind `127.0.0.1` to each candidate port **in order**.
2. Use the **first** that binds successfully; if one is taken, automatically move to
   the next. (Optionally also remember the last-good port and try it first.)
3. If somehow all are taken, surface an error in the UI (very unlikely with 6 ports).
4. Show the active port in **Settings → Browser** for debugging.

### Extension side (auto-detect)

1. On startup (and on first send failure), probe each candidate port with a cheap
   **`GET /whoami`** until one responds with our app's signature.
2. **Cache** the discovered port (e.g. `chrome.storage.local`) and use it for posts.
3. If a `POST /ingest` later fails (app restarted on a different port, app closed),
   clear the cache and **re-discover**.
4. Probes are fast and loopback-only; the whole scan is ~6 quick requests.

### `GET /whoami` (discovery + anti-squatting)

So the extension doesn't trust some *other* process that happens to hold the port,
the handshake verifies identity both ways:

```
GET http://127.0.0.1:<port>/whoami
  → 200 { "app": "ctracking", "version": "1.x", "wants": "X-Token" }
```

The extension confirms `app == "ctracking"` before trusting the port, then includes
the **shared `X-Token`** on every `POST /ingest`. The server rejects any request
without the valid token — so neither a squatting process nor a random webpage can
feed or read data.

## Local ingest server (Rust side)

- `axum` endpoints on `127.0.0.1` only (never exposed on LAN):
  - `GET /whoami` — unauthenticated identity handshake for discovery (above).
  - `POST /ingest` — token-protected; validates payload, inserts into `browser_visit`.
- Shared-secret `X-Token` header required on `/ingest`.
- `Origin` / CORS check so arbitrary websites can't post even if they guess the port.
- Active port chosen via the fallback logic above and shown in Settings.

## Privacy / scope options (configurable later)

- Option to store **domain only** instead of full URL.
- Allow/deny lists to skip sensitive domains (banking, health).
- Per the overall posture: data stays local, exported only on demand.

## Distribution

- For internal use, load as an **unpacked extension** or self-host a `.crx`.
- Chrome Web Store publishing is optional and out of scope for v1.
