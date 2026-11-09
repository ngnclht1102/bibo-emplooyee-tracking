-- +goose Up
-- Desktop "Send feedback" (ticket 160). Submitted from the app's What's new page;
-- the endpoint is public so personal-mode (no account) users can write in too, so
-- user_id is NULL for them and `email` is whatever contact they chose to leave.
CREATE TABLE feedback (
    id          bigserial PRIMARY KEY,
    user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
    email       text NOT NULL DEFAULT '',
    kind        text NOT NULL CHECK (kind IN ('bug','idea','question','other')),
    message     text NOT NULL,
    app_version text NOT NULL DEFAULT '',
    platform    text NOT NULL DEFAULT '',
    locale      text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_created_idx ON feedback (created_at DESC);

-- +goose Down
DROP TABLE feedback;
