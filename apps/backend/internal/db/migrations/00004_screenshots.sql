-- +goose Up
-- Screenshot metadata. The image bytes live on the backend's local disk; only the
-- relative path (under STORAGE_DIR) is stored here.
CREATE TABLE screenshots (
    id                bigserial PRIMARY KEY,
    client_uuid       uuid NOT NULL UNIQUE,
    user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    device_id         uuid NOT NULL,
    ts                bigint NOT NULL,
    file_path         text NOT NULL,         -- relative to STORAGE_DIR
    byte_size         integer NOT NULL,
    width             integer,
    height            integer,
    display_id        integer,
    client_updated_at bigint NOT NULL,
    received_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_screenshots_biz_ts ON screenshots(business_id, ts);
CREATE INDEX idx_screenshots_user_ts ON screenshots(user_id, ts);

-- +goose Down
DROP TABLE screenshots;
