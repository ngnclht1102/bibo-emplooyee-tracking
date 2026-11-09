-- +goose Up
-- Super-admin replies to desktop feedback (ticket 165). One reply per submission,
-- editable: writing it again clears reply_seen_at so the sender is notified afresh.
-- Only rows with a user_id can be notified (personal-mode senders have no account).
ALTER TABLE feedback
    ADD COLUMN reply          text NOT NULL DEFAULT '',
    ADD COLUMN replied_at     timestamptz,
    ADD COLUMN replied_by     uuid REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN reply_seen_at  timestamptz;

-- The desktop asks "any unread replies for me?" on every launch/focus.
CREATE INDEX feedback_user_reply_idx ON feedback (user_id) WHERE reply <> '';

-- +goose Down
DROP INDEX IF EXISTS feedback_user_reply_idx;
ALTER TABLE feedback
    DROP COLUMN reply,
    DROP COLUMN replied_at,
    DROP COLUMN replied_by,
    DROP COLUMN reply_seen_at;
