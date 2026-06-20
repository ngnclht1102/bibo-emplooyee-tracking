-- +goose Up
-- Persona model. account_type distinguishes a self-signup owner's audience
-- (manager = team, parent = family); businesses.kind mirrors it and drives the
-- labels/copy in the web + desktop onboarding. Existing rows default to the
-- manager/team behaviour they already had.
ALTER TABLE users ADD COLUMN account_type text NOT NULL DEFAULT 'manager'
    CHECK (account_type IN ('manager','parent'));
ALTER TABLE businesses ADD COLUMN kind text NOT NULL DEFAULT 'team'
    CHECK (kind IN ('team','family'));

-- +goose Down
ALTER TABLE businesses DROP COLUMN kind;
ALTER TABLE users DROP COLUMN account_type;
