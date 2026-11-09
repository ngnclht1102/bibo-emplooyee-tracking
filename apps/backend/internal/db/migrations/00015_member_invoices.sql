-- +goose Up
-- Billing turns around (ticket 159): a member invoices the workspace (the owner),
-- the owner never invoices outside. Clients are gone, an invoice belongs to the
-- member who issued it, and each member keeps their own "from" block.

-- Every existing invoice was a client invoice (billing never shipped to production),
-- so release its time and drop it — invoices.user_id can then be NOT NULL.
UPDATE time_entries SET invoice_id = NULL;
DELETE FROM invoice_lines;
DELETE FROM invoices;

ALTER TABLE invoices
    DROP COLUMN client_id,
    ADD COLUMN user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT;
CREATE INDEX invoices_user_idx ON invoices (user_id, issue_date);

ALTER TABLE projects DROP COLUMN client_id;
DROP TABLE clients;

-- Printed as the "from" block on that member's invoices (bank details, tax id).
ALTER TABLE memberships ADD COLUMN billing_details text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE memberships DROP COLUMN billing_details;

CREATE TABLE clients (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name        text NOT NULL,
    email       text NOT NULL DEFAULT '',
    address     text NOT NULL DEFAULT '',
    archived    boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clients_business_idx ON clients (business_id);
ALTER TABLE projects ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE RESTRICT;

UPDATE time_entries SET invoice_id = NULL;
DELETE FROM invoice_lines;
DELETE FROM invoices;
DROP INDEX invoices_user_idx;
ALTER TABLE invoices
    DROP COLUMN user_id,
    ADD COLUMN client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT;
