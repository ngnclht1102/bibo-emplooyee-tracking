-- +goose Up
-- pgcrypto provides gen_random_uuid(), used by later migrations for primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- +goose Down
DROP EXTENSION IF EXISTS pgcrypto;
