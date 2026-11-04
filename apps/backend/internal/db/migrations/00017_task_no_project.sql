-- +goose Up
-- CTR-37 (ticket 162): a task can stand on its own, with no project. Time logged on
-- such a task is billable at the member's own rate — there is no project rate or
-- billable flag to override it.
ALTER TABLE tasks ALTER COLUMN project_id DROP NOT NULL;

-- +goose Down
-- Only applies when no project-less task exists (it never deletes work).
ALTER TABLE tasks ALTER COLUMN project_id SET NOT NULL;
