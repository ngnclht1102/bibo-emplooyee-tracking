-- +goose Up
-- Daily rollup of activity_samples for the super-admin Business overview (ticket 149).
-- One row per UTC day × user × workspace with the seconds tracked. Rebuilt hourly by the
-- backend from activity_samples, so it is derived data and safe to drop.
CREATE TABLE activity_days (
    day         date NOT NULL,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    active_s    integer NOT NULL,
    PRIMARY KEY (day, user_id, business_id)
);
CREATE INDEX activity_days_business_idx ON activity_days (business_id, day);

-- +goose Down
DROP TABLE activity_days;
