-- +goose Up
-- Per-file installer download counters (macOS DMG, Windows MSI). One row per served
-- file; incremented on each origin hit (Cloudflare cache is bypassed for /download/*).
CREATE TABLE download_counts (
    file       text PRIMARY KEY,
    platform   text NOT NULL,
    count      bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE download_counts;
