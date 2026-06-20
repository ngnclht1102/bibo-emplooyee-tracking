-- +goose Up
-- Members (employees/kids) can log in by username instead of email. Email becomes
-- optional; every user must still have at least one identifier.
ALTER TABLE users ADD COLUMN username text;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Unique username when present (NULLs allowed for users who only have an email).
CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;

ALTER TABLE users ADD CONSTRAINT users_identifier_chk
    CHECK (email IS NOT NULL OR username IS NOT NULL);

-- +goose Down
ALTER TABLE users DROP CONSTRAINT users_identifier_chk;
DROP INDEX idx_users_username;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users DROP COLUMN username;
