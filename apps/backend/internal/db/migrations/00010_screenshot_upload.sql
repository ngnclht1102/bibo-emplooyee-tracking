-- +goose Up
-- Org-controlled screenshot upload switch (ticket 143). When false, member devices
-- still capture screenshots and keep them in the local gallery, but never send them
-- to the server. Only screenshots are affected — activity, keystroke counts and
-- browser visits keep syncing. Like the rest of the capture policy this is governed
-- by allow_employee_override.
ALTER TABLE businesses ADD COLUMN screenshot_upload boolean NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE businesses DROP COLUMN screenshot_upload;
