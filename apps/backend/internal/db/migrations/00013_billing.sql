-- +goose Up
-- Billing (ticket 152): clients → projects → tasks, time logged against tasks, hourly
-- rates per member (with history) and per project, and invoices built from unbilled
-- time. Money is stored in integer cents of the workspace currency.
ALTER TABLE businesses
    ADD COLUMN currency            text    NOT NULL DEFAULT 'USD',
    ADD COLUMN billing_details     text    NOT NULL DEFAULT '', -- "from" block on invoices
    ADD COLUMN invoice_next_number integer NOT NULL DEFAULT 1;

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

-- client_id NULL = internal project (never invoiced). rate_cents overrides member rates.
CREATE TABLE projects (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    client_id   uuid REFERENCES clients(id) ON DELETE RESTRICT,
    name        text NOT NULL,
    billable    boolean NOT NULL DEFAULT true,
    rate_cents  integer CHECK (rate_cents >= 0),
    archived    boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_business_idx ON projects (business_id);

CREATE TABLE tasks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    title       text NOT NULL,
    status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
    assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
    created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_project_idx ON tasks (project_id);
CREATE INDEX tasks_business_idx ON tasks (business_id);

-- Hourly rate history: the rate in force on a date is the latest effective_from <= date.
CREATE TABLE member_rates (
    id             bigserial PRIMARY KEY,
    business_id    uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rate_cents     integer NOT NULL CHECK (rate_cents >= 0),
    effective_from date NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (business_id, user_id, effective_from)
);

CREATE TABLE invoices (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    number         text NOT NULL,
    status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
    issue_date     date NOT NULL,
    due_date       date NOT NULL,
    period_from    date NOT NULL,
    period_to      date NOT NULL,
    currency       text NOT NULL,
    subtotal_cents bigint NOT NULL DEFAULT 0,
    tax_bp         integer NOT NULL DEFAULT 0 CHECK (tax_bp BETWEEN 0 AND 10000), -- basis points
    tax_cents      bigint NOT NULL DEFAULT 0,
    total_cents    bigint NOT NULL DEFAULT 0,
    notes          text NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    sent_at        timestamptz,
    paid_at        timestamptz,
    UNIQUE (business_id, number)
);
CREATE INDEX invoices_business_idx ON invoices (business_id, issue_date);

-- Rates and amounts are frozen here when the invoice is created.
CREATE TABLE invoice_lines (
    id           bigserial PRIMARY KEY,
    invoice_id   uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    position     integer NOT NULL,
    description  text NOT NULL,
    user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
    task_id      uuid REFERENCES tasks(id) ON DELETE SET NULL,
    seconds      integer NOT NULL,
    rate_cents   integer NOT NULL,
    amount_cents bigint NOT NULL
);
CREATE INDEX invoice_lines_invoice_idx ON invoice_lines (invoice_id);

-- Time logged against a task. invoice_id set = billed and locked. client_uuid makes
-- desktop timer uploads idempotent (retries never double-log).
CREATE TABLE time_entries (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
    day         date NOT NULL,
    duration_s  integer NOT NULL CHECK (duration_s > 0 AND duration_s <= 86400),
    note        text NOT NULL DEFAULT '',
    source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','timer')),
    started_at  timestamptz,
    client_uuid text UNIQUE,
    invoice_id  uuid REFERENCES invoices(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_entries_business_day_idx ON time_entries (business_id, day);
CREATE INDEX time_entries_user_day_idx ON time_entries (user_id, day);
CREATE INDEX time_entries_task_idx ON time_entries (task_id);
CREATE INDEX time_entries_invoice_idx ON time_entries (invoice_id);

-- +goose Down
DROP TABLE time_entries;
DROP TABLE invoice_lines;
DROP TABLE invoices;
DROP TABLE member_rates;
DROP TABLE tasks;
DROP TABLE projects;
DROP TABLE clients;
ALTER TABLE businesses DROP COLUMN currency, DROP COLUMN billing_details, DROP COLUMN invoice_next_number;
