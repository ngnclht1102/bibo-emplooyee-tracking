-- +goose Up
-- Ticket 167: a project rate no longer silently outranks everyone's own hourly rate.
-- It only does when the owner asks for it; otherwise it is just the fallback for
-- people who have no rate of their own. Projects that already carry a rate keep
-- overriding, so no live project re-prices behind the owner's back.
ALTER TABLE projects ADD COLUMN rate_overrides_members boolean NOT NULL DEFAULT false;
UPDATE projects SET rate_overrides_members = true WHERE rate_cents IS NOT NULL;

-- +goose Down
ALTER TABLE projects DROP COLUMN rate_overrides_members;
