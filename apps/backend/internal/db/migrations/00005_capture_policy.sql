-- +goose Up
-- Org-controlled capture policy. Employees inherit these; the desktop locks the
-- corresponding settings unless allow_employee_override is true. Standalone users
-- (no business) keep the app's local defaults.
ALTER TABLE businesses ADD COLUMN screenshot_interval_s integer NOT NULL DEFAULT 300;
ALTER TABLE businesses ADD COLUMN idle_threshold_s integer NOT NULL DEFAULT 60;
ALTER TABLE businesses ADD COLUMN allow_employee_override boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE businesses DROP COLUMN allow_employee_override;
ALTER TABLE businesses DROP COLUMN idle_threshold_s;
ALTER TABLE businesses DROP COLUMN screenshot_interval_s;
