-- +goose Up
CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,           -- stored lowercased by the app
    password_hash text NOT NULL,                  -- argon2id encoded string
    display_name  text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE businesses (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    screenshot_retention_days integer,            -- NULL = keep forever
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_businesses_owner ON businesses(owner_user_id);

CREATE TABLE memberships (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    role        text NOT NULL CHECK (role IN ('owner','employee')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, business_id)
);
CREATE INDEX idx_memberships_business ON memberships(business_id);

CREATE TABLE devices (
    id           uuid PRIMARY KEY,                -- client-generated per install
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label        text,
    last_seen_at timestamptz
);

-- +goose Down
DROP TABLE devices;
DROP TABLE memberships;
DROP TABLE businesses;
DROP TABLE users;
