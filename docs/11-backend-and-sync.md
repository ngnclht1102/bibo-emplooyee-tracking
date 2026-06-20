# Backend, sync & web admin

Adds a **central backend** so an owner can review their team's activity, while the
desktop app keeps working fully offline. The backend is a **replica fed one way**;
the local SQLite file stays the source of truth.

## Principles (locked)

1. **One-directional dataflow.** Chrome extension → desktop app (local SQLite) →
   backend. The backend never pushes activity rows back to the desktop. Owner
   *reads* (the web admin / reporting APIs) are a separate read path, not part of the
   activity pipeline.
2. **Local-first.** Tracking, storage, and the desktop UI never depend on the network.
   Sync happens periodically and whenever the internet is available; offline just means
   rows stay pending.
3. **Respect local on conflict.** The backend never originates activity data, so the
   client payload always wins. Implemented as idempotent upsert keyed by a
   client-generated UUID.
4. **No third-party file storage.** Screenshots live on the backend's local disk under
   a storage folder. No S3 / object storage.

## Components

```
Chrome ext ──▶ Desktop app (Tauri, local SQLite) ──sync──▶ Go backend (Gin + Postgres)
                                                                │   files on local disk
                                                                ▼
                                                     Web admin (React) ── owner reads
```

- **Backend** — Go + Gin + Postgres (`pgx`), goose migrations. Serves auth, owner
  management, sync ingest, reporting, and screenshot files.
- **Web admin** (`apps/web-admin`) — React + Vite SPA reusing `@ctracking/design`
  tokens. Owner-facing: login, business/employee management, reporting dashboards,
  screenshot retention controls. The backend serves it as static files (Vite proxy in
  dev).
- **Desktop** — gains a login screen, secure session storage, a sync worker, and
  ≤50 KB screenshot compression.

## Repo layout

```
apps/backend/
  cmd/server/main.go
  internal/
    config/        env (DB url, JWT secret, storage dir, port, retention defaults)
    db/            pgx pool + goose migrations
    auth/          argon2id password hashing, JWT access+refresh, middleware
    middleware/    auth (Bearer→user), CORS, login rate-limit
    handlers/      public, auth, businesses, employees, sync, reports
    filestore/     screenshot writer/reader (uuid filenames, traversal-safe)
    sync/          idempotent upsert-by-uuid
    retention/     screenshot cleanup (manual + scheduled sweep)
  migrations/
  storage/screenshots/        (gitignored — file store root)
  go.mod  Dockerfile  .env.example

apps/web-admin/                React + Vite SPA (owner dashboard)
```

## Identity & multi-tenant model (Postgres)

```sql
CREATE TABLE users (
  id            uuid PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE businesses (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  screenshot_retention_days integer,    -- NULL = keep forever
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  business_id uuid NOT NULL REFERENCES businesses(id),
  role        text NOT NULL CHECK (role IN ('owner','employee')),
  UNIQUE (user_id, business_id)
);

CREATE TABLE devices (
  id           uuid PRIMARY KEY,    -- one per desktop install (client-generated)
  user_id      uuid NOT NULL REFERENCES users(id),
  label        text,
  last_seen_at timestamptz
);
```

- **Every user can be an owner.** Creating a business inserts a `businesses` row plus
  an `owner` membership.
- **Skip-business flow.** If a user creates an employee while owning no business, the
  backend **auto-creates a default business** (`"<display_name>'s Team"`) and proceeds.
  So creating an employee always lands inside a business.
- **Pre-created employee accounts.** The owner supplies email + temporary password;
  the backend creates the `users` row + an `employee` membership. The employee later
  logs in with those credentials from the desktop login picker.

## Auth

JWT access + refresh. **`user_id` is always taken from the token, never the request
body** — a synced row cannot claim another user. `business_id` is resolved server-side
from membership. Passwords hashed with argon2id; login rate-limited; HTTPS in prod.

Public (no token):
- `GET  /v1/public/businesses` → `[{business_id, name, owner_name}]` — powers the
  "find your company/owner" login picker.
- `POST /v1/auth/login` `{email, password, business_id?}` → access + refresh.
- `POST /v1/auth/refresh`.

Owner (token):
- `POST /v1/businesses`, `GET /v1/businesses/mine`
- `POST /v1/employees` `{email, password, display_name, business_id?}` — omit
  `business_id` to use the owner's first business, **auto-creating** one
  (`"<display_name>'s Team"`) if the owner has none.
- `GET /v1/businesses/:id/employees`
- `PATCH /v1/businesses/:id/settings` (retention days, etc.)
- `GET /v1/me` — the authenticated user.
- `POST /v1/auth/register` — owner self-signup (any user can be an owner).

## Sync

### Marking a row synced (local SQLite — migration v2)

Each of the four local tables (`activity_sample`, `keystroke_bucket`, `screenshot`,
`browser_visit`) gains:

| Column | Purpose |
|---|---|
| `client_uuid TEXT NOT NULL UNIQUE` | Stable global key generated on insert; the backend's natural key. The local autoincrement `id` is not globally unique, so we need this. |
| `synced INTEGER NOT NULL DEFAULT 0` | `0` = pending, `1` = confirmed by backend. |
| `updated_at INTEGER NOT NULL` | Bumped on any mutation. |

Plus a partial index `... WHERE synced = 0` per table for cheap "what's pending" scans.

**Any mutation resets `synced = 0` and bumps `updated_at`.** This matters for
`keystroke_bucket`, which upserts/increments after first sync — flipping it back to
pending re-sends the new count.

### Backend activity tables

Each mirrors its local table plus ownership + sync key: `client_uuid uuid UNIQUE`,
`user_id`, `business_id`, `device_id`, `client_updated_at bigint`,
`received_at timestamptz`. Example:

```sql
CREATE TABLE activity_samples (
  id            bigserial PRIMARY KEY,
  client_uuid   uuid NOT NULL UNIQUE,
  user_id       uuid NOT NULL,
  business_id   uuid NOT NULL,
  device_id     uuid NOT NULL,
  ts            bigint NOT NULL,
  app_name      text NOT NULL,
  window_title  text,
  pid           integer,
  duration_s    integer NOT NULL,
  client_updated_at bigint NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);
```

Same shape for `keystroke_buckets`, `browser_visits`, and `screenshots` (the last with
`file_path` = backend-stored path + `byte_size`).

### Idempotent ingest (backend)

Every sync handler upserts `ON CONFLICT (client_uuid) DO UPDATE` with the client's
values. Two guarantees follow:

- **Retry-safe.** If the desktop crashes after the backend wrote but before it marked
  `synced = 1`, the re-send is a harmless overwrite — no duplicates.
- **Conflict → local wins.** A duplicate `client_uuid` overwrites with the client
  payload. Since the backend never originates activity data, "respect local" falls out
  for free.

Each handler returns the list of accepted `client_uuid`s; the desktop marks exactly
those `synced = 1`.

Endpoints:
- `POST /v1/sync/batch` — JSON envelope with `device_id` + arrays for
  activity / keystrokes / browser → accepted uuids per kind.
- `POST /v1/sync/screenshots` — multipart (metadata + image bytes), since files can't
  ride in JSON → accepted uuids.

### Sync worker (desktop, Rust)

Background task. Triggers: timer (every ~2–5 min), network-available, and app start.

1. Check connectivity; offline → no-op (rows stay pending).
2. Per table: `SELECT ... WHERE synced = 0 ORDER BY id LIMIT N`.
3. POST the batch. On 2xx, `UPDATE ... SET synced = 1` for the returned uuids.
4. Exponential backoff on failure. `attempts` / `last_sync_error` columns aid
   diagnostics.

Sync never deletes local rows. Local retention/cleanup runs independently and only
prunes files already marked `synced = 1`.

## Screenshots

### ≤50 KB compression before upload (desktop, Rust)

Capture → downscale → encode with a **target-size loop** so every upload is ≤50 KB:

1. Downscale to a max long-edge (~1366 px).
2. Encode **WebP** starting ~q55.
3. If still > 50 KB: step quality down (q45 → q35 → q25), then reduce resolution
   (1366 → 1152 → 960) and retry.
4. Hard floor (e.g. q20 / 960 px) so it never loops forever — accept the smallest
   result at the floor. Optional grayscale knob shaves more.

The ≤50 KB file is what's written locally **and** uploaded — one encode, no
re-compress.

### Storage on the backend

Stores bytes verbatim at:

```
storage/screenshots/<business_id>/<user_id>/<yyyy-mm-dd>/<client_uuid>.webp
```

Records the path + `byte_size`. **Filenames are uuid-only** (never client-supplied
paths) to block traversal. The backend rejects/flags uploads over a sane max
(e.g. 200 KB) as a guard. Image serving is auth-gated:
`GET /v1/screenshots/:client_uuid` streams from disk after an ownership check — never a
raw filesystem path.

## Reporting APIs (owner reads)

All enforce that the caller is an **owner of the business the employee belongs to**
(membership check) — an owner only ever sees their own business's data.

- `GET /v1/reports/employees` — roster + last-seen + today's active time.
- `GET /v1/reports/employees/:id/activity?from&to` — app-usage timeline + breakdown.
- `GET /v1/reports/employees/:id/keystrokes?from&to` — bucket counts for the chart.
- `GET /v1/reports/employees/:id/browser?from&to` — visit list.
- `GET /v1/reports/employees/:id/screenshots?from&to` — paginated metadata.
- `GET /v1/screenshots/:client_uuid` — auth-gated image serving.

## Screenshot cleanup (owner-controlled)

Retention lives per business (`businesses.screenshot_retention_days`, NULL = forever).

- **Web admin control:** set retention (presets 7 / 14 / 30 / 90 / Never) via
  `PATCH /v1/businesses/:id/settings`, plus a manual **"Clean up now"** button →
  `POST /v1/businesses/:id/screenshots/cleanup?older_than_days=N`, which deletes
  `screenshots` rows **and** files under `storage/screenshots/<business_id>/...` and
  returns count + bytes freed. Destructive → confirmation dialog.
- **Automatic sweep:** a backend ticker (hourly) deletes rows + files older than the
  cutoff for every business with a non-null retention. Files are removed before the
  row; uuid-path only.

This is backend-replica retention and is independent of the desktop's local retention,
which only prunes files already `synced = 1`. So backend cleanup can be aggressive
without losing un-synced data.

See also [01-architecture.md](01-architecture.md) (idle/active model, trackers),
[02-data-model.md](02-data-model.md) (local schema), and the sprint tasks in
[tickets/00-INDEX.md](tickets/00-INDEX.md) Phase 5.
