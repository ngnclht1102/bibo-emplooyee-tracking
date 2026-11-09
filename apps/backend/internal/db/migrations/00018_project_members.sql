-- +goose Up
-- Ticket 163: a project is open to the whole workspace by default; it can optionally be
-- limited to selected people. The allow-list is only consulted when restricted is true,
-- so rows survive switching the project back to open.
ALTER TABLE projects ADD COLUMN restricted boolean NOT NULL DEFAULT false;

CREATE TABLE project_members (
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON project_members (user_id);

-- +goose Down
DROP TABLE project_members;
ALTER TABLE projects DROP COLUMN restricted;
