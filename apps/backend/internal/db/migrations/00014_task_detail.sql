-- +goose Up
-- CTR-16 (ticket 158): a timer entry records when it stopped, so the owner's task
-- detail view can attribute screenshots and keystrokes to the window the timer ran
-- (duration_s is active time only, so it can't stand in for the wall-clock window).
ALTER TABLE time_entries ADD COLUMN ended_at timestamptz;

-- +goose Down
ALTER TABLE time_entries DROP COLUMN ended_at;
