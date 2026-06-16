-- +goose Up
-- Backend replicas of the desktop's local tables. client_uuid is the natural key:
-- the desktop generates it on insert, so ingest is idempotent (upsert on conflict)
-- and "respect local" falls out — a re-sent row overwrites with the client's values.

CREATE TABLE activity_samples (
    id                bigserial PRIMARY KEY,
    client_uuid       uuid NOT NULL UNIQUE,
    user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    device_id         uuid NOT NULL,
    ts                bigint NOT NULL,
    app_name          text NOT NULL,
    window_title      text,
    pid               integer,
    duration_s        integer NOT NULL,
    client_updated_at bigint NOT NULL,
    received_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_biz_ts ON activity_samples(business_id, ts);
CREATE INDEX idx_activity_user_ts ON activity_samples(user_id, ts);

CREATE TABLE keystroke_buckets (
    id                bigserial PRIMARY KEY,
    client_uuid       uuid NOT NULL UNIQUE,
    user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    device_id         uuid NOT NULL,
    ts_bucket         bigint NOT NULL,
    count             integer NOT NULL,
    client_updated_at bigint NOT NULL,
    received_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_keystroke_biz_ts ON keystroke_buckets(business_id, ts_bucket);
CREATE INDEX idx_keystroke_user_ts ON keystroke_buckets(user_id, ts_bucket);

CREATE TABLE browser_visits (
    id                bigserial PRIMARY KEY,
    client_uuid       uuid NOT NULL UNIQUE,
    user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    device_id         uuid NOT NULL,
    ts                bigint NOT NULL,
    url               text NOT NULL,
    page_title        text,
    browser           text,
    duration_s        integer NOT NULL,
    client_updated_at bigint NOT NULL,
    received_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_browser_biz_ts ON browser_visits(business_id, ts);
CREATE INDEX idx_browser_user_ts ON browser_visits(user_id, ts);

-- +goose Down
DROP TABLE browser_visits;
DROP TABLE keystroke_buckets;
DROP TABLE activity_samples;
