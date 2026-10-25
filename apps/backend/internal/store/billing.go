package store

import (
	"context"
	"errors"
	"time"

	"ctracking/backend/internal/billing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Billing (ticket 152): clients, projects, tasks, member rates, time entries and
// invoices. Every query is scoped by business_id — handlers check membership/role
// first, the store never trusts an id from another workspace.

// ErrLocked is returned when time that is already on an invoice would be changed.
var ErrLocked = errors.New("locked")

// ErrInUse is returned when a row can't be deleted because others reference it.
var ErrInUse = errors.New("in use")

// isFKViolation: a delete blocked by a referencing row. Postgres 16 reports ON
// DELETE RESTRICT as 23503 (foreign_key_violation), 18 as 23001 (restrict_violation).
func isFKViolation(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && (pg.Code == "23503" || pg.Code == "23001")
}

// MemberRole returns the caller's role in a business ("" when not a member).
func (s *Store) MemberRole(ctx context.Context, userID, businessID string) (string, error) {
	var role string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM memberships WHERE user_id = $1 AND business_id = $2`, userID, businessID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return role, err
}

// ---------- settings ----------

type BillingSettings struct {
	Currency       string `json:"currency"`
	BillingDetails string `json:"billing_details"`
	BusinessName   string `json:"business_name"`
}

func (s *Store) GetBillingSettings(ctx context.Context, bizID string) (BillingSettings, error) {
	var b BillingSettings
	err := s.pool.QueryRow(ctx, `SELECT currency, billing_details, name FROM businesses WHERE id = $1`, bizID).
		Scan(&b.Currency, &b.BillingDetails, &b.BusinessName)
	return b, err
}

func (s *Store) UpdateBillingSettings(ctx context.Context, bizID, currency, details string) error {
	_, err := s.pool.Exec(ctx, `UPDATE businesses SET currency = $2, billing_details = $3 WHERE id = $1`,
		bizID, currency, details)
	return err
}

// ---------- members + rates ----------

type BillingMember struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Login     string `json:"login"`
	Role      string `json:"role"`
	RateCents *int   `json:"rate_cents"` // rate in force today, nil = none set
}

type MemberRate struct {
	ID            int64  `json:"id"`
	UserID        string `json:"user_id"`
	RateCents     int    `json:"rate_cents"`
	EffectiveFrom string `json:"effective_from"`
}

func (s *Store) BillingMembers(ctx context.Context, bizID, today string) ([]BillingMember, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT u.id, u.display_name, COALESCE(u.username, u.email, ''), m.role,
		        (SELECT r.rate_cents FROM member_rates r
		          WHERE r.business_id = m.business_id AND r.user_id = u.id AND r.effective_from <= $2::date
		          ORDER BY r.effective_from DESC LIMIT 1)
		   FROM memberships m JOIN users u ON u.id = m.user_id
		  WHERE m.business_id = $1
		  ORDER BY m.role DESC, u.display_name`, bizID, today)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (BillingMember, error) {
		var m BillingMember
		err := r.Scan(&m.ID, &m.Name, &m.Login, &m.Role, &m.RateCents)
		return m, err
	})
}

func (s *Store) ListRates(ctx context.Context, bizID string) ([]MemberRate, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, rate_cents, effective_from::text FROM member_rates
		  WHERE business_id = $1 ORDER BY user_id, effective_from DESC`, bizID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (MemberRate, error) {
		var m MemberRate
		err := r.Scan(&m.ID, &m.UserID, &m.RateCents, &m.EffectiveFrom)
		return m, err
	})
}

// SetRate records a member's rate from a date (replacing one set for the same date).
func (s *Store) SetRate(ctx context.Context, bizID, userID string, cents int, from string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO member_rates (business_id, user_id, rate_cents, effective_from)
		 SELECT $1, $2, $3, $4::date WHERE EXISTS (SELECT 1 FROM memberships WHERE business_id = $1 AND user_id = $2)
		 ON CONFLICT (business_id, user_id, effective_from) DO UPDATE SET rate_cents = EXCLUDED.rate_cents`,
		bizID, userID, cents, from)
	return err
}

func (s *Store) DeleteRate(ctx context.Context, bizID string, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM member_rates WHERE business_id = $1 AND id = $2`, bizID, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *Store) rateHistory(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, bizID string) ([]billing.Rate, error) {
	rows, err := q.Query(ctx,
		`SELECT user_id, rate_cents, effective_from::text FROM member_rates WHERE business_id = $1`, bizID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (billing.Rate, error) {
		var x billing.Rate
		err := r.Scan(&x.UserID, &x.RateCents, &x.EffectiveFrom)
		return x, err
	})
}

// ---------- clients ----------

type Client struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Address  string `json:"address"`
	Archived bool   `json:"archived"`
}

func (s *Store) ListClients(ctx context.Context, bizID string) ([]Client, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, email, address, archived FROM clients WHERE business_id = $1 ORDER BY archived, lower(name)`, bizID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Client, error) {
		var c Client
		err := r.Scan(&c.ID, &c.Name, &c.Email, &c.Address, &c.Archived)
		return c, err
	})
}

func (s *Store) SaveClient(ctx context.Context, bizID string, c Client) (Client, error) {
	var err error
	if c.ID == "" {
		err = s.pool.QueryRow(ctx,
			`INSERT INTO clients (business_id, name, email, address) VALUES ($1, $2, $3, $4) RETURNING id`,
			bizID, c.Name, c.Email, c.Address).Scan(&c.ID)
	} else {
		var tag pgconn.CommandTag
		tag, err = s.pool.Exec(ctx,
			`UPDATE clients SET name = $3, email = $4, address = $5, archived = $6 WHERE business_id = $1 AND id = $2`,
			bizID, c.ID, c.Name, c.Email, c.Address, c.Archived)
		if err == nil && tag.RowsAffected() == 0 {
			err = ErrNotFound
		}
	}
	return c, err
}

func (s *Store) DeleteClient(ctx context.Context, bizID, id string) error {
	return deleteScoped(ctx, s, `DELETE FROM clients WHERE business_id = $1 AND id = $2`, bizID, id)
}

func deleteScoped(ctx context.Context, s *Store, sql, bizID, id string) error {
	tag, err := s.pool.Exec(ctx, sql, bizID, id)
	if isFKViolation(err) {
		return ErrInUse
	}
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// ---------- projects ----------

type Project struct {
	ID         string  `json:"id"`
	ClientID   *string `json:"client_id"`
	ClientName string  `json:"client_name"`
	Name       string  `json:"name"`
	Billable   bool    `json:"billable"`
	RateCents  *int    `json:"rate_cents"`
	Archived   bool    `json:"archived"`
}

func (s *Store) ListProjects(ctx context.Context, bizID string) ([]Project, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT p.id, p.client_id, COALESCE(c.name, ''), p.name, p.billable, p.rate_cents, p.archived
		   FROM projects p LEFT JOIN clients c ON c.id = p.client_id
		  WHERE p.business_id = $1 ORDER BY p.archived, lower(p.name)`, bizID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Project, error) {
		var p Project
		err := r.Scan(&p.ID, &p.ClientID, &p.ClientName, &p.Name, &p.Billable, &p.RateCents, &p.Archived)
		return p, err
	})
}

// SaveProject creates or updates a project; a client must belong to the same workspace.
func (s *Store) SaveProject(ctx context.Context, bizID string, p Project) (Project, error) {
	if p.ClientID != nil {
		var ok bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM clients WHERE business_id = $1 AND id = $2)`,
			bizID, *p.ClientID).Scan(&ok); err != nil {
			return p, err
		}
		if !ok {
			return p, ErrNotFound
		}
	}
	var err error
	if p.ID == "" {
		err = s.pool.QueryRow(ctx,
			`INSERT INTO projects (business_id, client_id, name, billable, rate_cents) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			bizID, p.ClientID, p.Name, p.Billable, p.RateCents).Scan(&p.ID)
	} else {
		var tag pgconn.CommandTag
		tag, err = s.pool.Exec(ctx,
			`UPDATE projects SET client_id = $3, name = $4, billable = $5, rate_cents = $6, archived = $7
			  WHERE business_id = $1 AND id = $2`,
			bizID, p.ID, p.ClientID, p.Name, p.Billable, p.RateCents, p.Archived)
		if err == nil && tag.RowsAffected() == 0 {
			err = ErrNotFound
		}
	}
	return p, err
}

func (s *Store) DeleteProject(ctx context.Context, bizID, id string) error {
	return deleteScoped(ctx, s, `DELETE FROM projects WHERE business_id = $1 AND id = $2`, bizID, id)
}

// ---------- tasks ----------

type Task struct {
	ID           string  `json:"id"`
	ProjectID    string  `json:"project_id"`
	ProjectName  string  `json:"project_name"`
	ClientName   string  `json:"client_name"`
	Title        string  `json:"title"`
	Status       string  `json:"status"`
	AssigneeID   *string `json:"assignee_id"`
	AssigneeName string  `json:"assignee_name"`
	CreatedBy    *string `json:"created_by"`
	LoggedS      int64   `json:"logged_s"`
	CreatedAt    string  `json:"created_at"`
}

const taskSelect = `SELECT t.id, t.project_id, p.name, COALESCE(c.name, ''), t.title, t.status, t.assignee_id,
       COALESCE(a.display_name, ''), t.created_by,
       COALESCE((SELECT sum(e.duration_s) FROM time_entries e WHERE e.task_id = t.id), 0),
       to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  FROM tasks t JOIN projects p ON p.id = t.project_id
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN users a ON a.id = t.assignee_id`

func scanTasks(rows pgx.Rows) ([]Task, error) {
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Task, error) {
		var t Task
		err := r.Scan(&t.ID, &t.ProjectID, &t.ProjectName, &t.ClientName, &t.Title, &t.Status, &t.AssigneeID,
			&t.AssigneeName, &t.CreatedBy, &t.LoggedS, &t.CreatedAt)
		return t, err
	})
}

// ListTasks returns a workspace's tasks. activeOnly skips tasks of archived projects.
func (s *Store) ListTasks(ctx context.Context, bizID string, activeOnly bool) ([]Task, error) {
	rows, err := s.pool.Query(ctx, taskSelect+`
		 WHERE t.business_id = $1 AND (NOT $2 OR NOT p.archived)
		 ORDER BY t.status, t.created_at DESC`, bizID, activeOnly)
	if err != nil {
		return nil, err
	}
	return scanTasks(rows)
}

func (s *Store) GetTask(ctx context.Context, bizID, id string) (Task, error) {
	rows, err := s.pool.Query(ctx, taskSelect+` WHERE t.business_id = $1 AND t.id = $2`, bizID, id)
	if err != nil {
		return Task{}, err
	}
	list, err := scanTasks(rows)
	if err != nil {
		return Task{}, err
	}
	if len(list) == 0 {
		return Task{}, ErrNotFound
	}
	return list[0], nil
}

// SaveTask creates or updates a task. The project must be in the workspace and not
// archived (for new tasks); an assignee must be a member.
func (s *Store) SaveTask(ctx context.Context, bizID, actorID string, t Task) (Task, error) {
	var ok bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM projects WHERE business_id = $1 AND id = $2 AND (NOT archived OR $3))`,
		bizID, t.ProjectID, t.ID != "").Scan(&ok); err != nil {
		return t, err
	}
	if !ok {
		return t, ErrNotFound
	}
	if t.AssigneeID != nil {
		role, err := s.MemberRole(ctx, *t.AssigneeID, bizID)
		if err != nil {
			return t, err
		}
		if role == "" {
			return t, ErrForbidden
		}
	}
	var err error
	if t.ID == "" {
		err = s.pool.QueryRow(ctx,
			`INSERT INTO tasks (business_id, project_id, title, status, assignee_id, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
			bizID, t.ProjectID, t.Title, t.Status, t.AssigneeID, actorID).Scan(&t.ID)
	} else {
		var tag pgconn.CommandTag
		tag, err = s.pool.Exec(ctx,
			`UPDATE tasks SET project_id = $3, title = $4, status = $5, assignee_id = $6 WHERE business_id = $1 AND id = $2`,
			bizID, t.ID, t.ProjectID, t.Title, t.Status, t.AssigneeID)
		if err == nil && tag.RowsAffected() == 0 {
			err = ErrNotFound
		}
	}
	if err != nil {
		return t, err
	}
	return s.GetTask(ctx, bizID, t.ID)
}

func (s *Store) DeleteTask(ctx context.Context, bizID, id string) error {
	return deleteScoped(ctx, s, `DELETE FROM tasks WHERE business_id = $1 AND id = $2`, bizID, id)
}

// ---------- time entries ----------

type TimeEntry struct {
	ID            string  `json:"id"`
	UserID        string  `json:"user_id"`
	UserName      string  `json:"user_name"`
	TaskID        string  `json:"task_id"`
	TaskTitle     string  `json:"task_title"`
	ProjectID     string  `json:"project_id"`
	ProjectName   string  `json:"project_name"`
	ClientName    string  `json:"client_name"`
	Billable      bool    `json:"billable"`
	Day           string  `json:"day"`
	DurationS     int     `json:"duration_s"`
	Note          string  `json:"note"`
	Source        string  `json:"source"`
	StartedAt     *string `json:"started_at"`
	InvoiceID     *string `json:"invoice_id"`
	InvoiceNumber string  `json:"invoice_number"`
	ClientUUID    *string `json:"-"`
}

const entrySelect = `SELECT e.id, e.user_id, u.display_name, e.task_id, t.title, p.id, p.name, COALESCE(c.name, ''),
       p.billable AND p.client_id IS NOT NULL, e.day::text, e.duration_s, e.note, e.source,
       to_char(e.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), e.invoice_id, COALESCE(i.number, '')
  FROM time_entries e
  JOIN users u ON u.id = e.user_id
  JOIN tasks t ON t.id = e.task_id
  JOIN projects p ON p.id = t.project_id
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN invoices i ON i.id = e.invoice_id`

func scanEntries(rows pgx.Rows) ([]TimeEntry, error) {
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (TimeEntry, error) {
		var e TimeEntry
		err := r.Scan(&e.ID, &e.UserID, &e.UserName, &e.TaskID, &e.TaskTitle, &e.ProjectID, &e.ProjectName,
			&e.ClientName, &e.Billable, &e.Day, &e.DurationS, &e.Note, &e.Source, &e.StartedAt, &e.InvoiceID, &e.InvoiceNumber)
		return e, err
	})
}

// EntryFilter narrows ListEntries; empty fields don't filter.
type EntryFilter struct {
	From, To  string // inclusive days
	UserID    string
	ProjectID string
}

func (s *Store) ListEntries(ctx context.Context, bizID string, f EntryFilter) ([]TimeEntry, error) {
	rows, err := s.pool.Query(ctx, entrySelect+`
		 WHERE e.business_id = $1 AND e.day BETWEEN $2::date AND $3::date
		   AND ($4 = '' OR e.user_id::text = $4) AND ($5 = '' OR p.id::text = $5)
		 ORDER BY e.day DESC, e.created_at DESC`, bizID, f.From, f.To, f.UserID, f.ProjectID)
	if err != nil {
		return nil, err
	}
	return scanEntries(rows)
}

func (s *Store) GetEntry(ctx context.Context, bizID, id string) (TimeEntry, error) {
	rows, err := s.pool.Query(ctx, entrySelect+` WHERE e.business_id = $1 AND e.id = $2`, bizID, id)
	if err != nil {
		return TimeEntry{}, err
	}
	list, err := scanEntries(rows)
	if err != nil {
		return TimeEntry{}, err
	}
	if len(list) == 0 {
		return TimeEntry{}, ErrNotFound
	}
	return list[0], nil
}

// SaveEntry creates or updates time. The task must be in the workspace and the
// user a member; billed (invoiced) time is locked. A repeated client_uuid returns
// the entry already stored (idempotent timer uploads).
func (s *Store) SaveEntry(ctx context.Context, bizID string, e TimeEntry) (TimeEntry, error) {
	var ok bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM tasks WHERE business_id = $1 AND id = $2)`,
		bizID, e.TaskID).Scan(&ok); err != nil {
		return e, err
	}
	if !ok {
		return e, ErrNotFound
	}
	if role, err := s.MemberRole(ctx, e.UserID, bizID); err != nil {
		return e, err
	} else if role == "" {
		return e, ErrForbidden
	}
	if e.ID == "" {
		err := s.pool.QueryRow(ctx,
			`INSERT INTO time_entries (business_id, user_id, task_id, day, duration_s, note, source, started_at, client_uuid)
			 VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8::timestamptz, $9)
			 ON CONFLICT (client_uuid) DO NOTHING RETURNING id`,
			bizID, e.UserID, e.TaskID, e.Day, e.DurationS, e.Note, e.Source, e.StartedAt, e.ClientUUID).Scan(&e.ID)
		if errors.Is(err, pgx.ErrNoRows) && e.ClientUUID != nil {
			err = s.pool.QueryRow(ctx, `SELECT id FROM time_entries WHERE business_id = $1 AND client_uuid = $2`,
				bizID, *e.ClientUUID).Scan(&e.ID)
			if errors.Is(err, pgx.ErrNoRows) {
				return e, ErrConflict // that uuid belongs to another workspace
			}
		}
		if err != nil {
			return e, err
		}
	} else {
		tag, err := s.pool.Exec(ctx,
			`UPDATE time_entries SET user_id = $3, task_id = $4, day = $5::date, duration_s = $6, note = $7, updated_at = now()
			  WHERE business_id = $1 AND id = $2 AND invoice_id IS NULL`,
			bizID, e.ID, e.UserID, e.TaskID, e.Day, e.DurationS, e.Note)
		if err != nil {
			return e, err
		}
		if tag.RowsAffected() == 0 {
			if _, gerr := s.GetEntry(ctx, bizID, e.ID); gerr != nil {
				return e, gerr
			}
			return e, ErrLocked
		}
	}
	return s.GetEntry(ctx, bizID, e.ID)
}

func (s *Store) DeleteEntry(ctx context.Context, bizID, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM time_entries WHERE business_id = $1 AND id = $2 AND invoice_id IS NULL`, bizID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		if _, gerr := s.GetEntry(ctx, bizID, id); gerr != nil {
			return gerr
		}
		return ErrLocked
	}
	return nil
}

// TrackedDay is automatically tracked active time for one member on one local day.
type TrackedDay struct {
	UserID string `json:"user_id"`
	Day    string `json:"day"`
	Secs   int64  `json:"seconds"`
}

// TrackedTime sums tracked activity per member per local day (tzOffsetMin = the
// viewer's UTC offset in minutes), so logged hours can be compared with it.
func (s *Store) TrackedTime(ctx context.Context, bizID, from, to string, tzOffsetMin int) ([]TrackedDay, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT user_id, to_timestamp(ts + $4 * 60)::date::text AS d, sum(duration_s)
		   FROM activity_samples
		  WHERE business_id = $1
		    AND ts >= extract(epoch FROM $2::date) - $4 * 60
		    AND ts <  extract(epoch FROM $3::date + 1) - $4 * 60
		  GROUP BY user_id, d`, bizID, from, to, tzOffsetMin)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (TrackedDay, error) {
		var d TrackedDay
		err := r.Scan(&d.UserID, &d.Day, &d.Secs)
		return d, err
	})
}

// ---------- invoices ----------

type Invoice struct {
	ID            string         `json:"id"`
	ClientID      string         `json:"client_id"`
	ClientName    string         `json:"client_name"`
	ClientEmail   string         `json:"client_email"`
	ClientAddress string         `json:"client_address"`
	Number        string         `json:"number"`
	Status        string         `json:"status"`
	IssueDate     string         `json:"issue_date"`
	DueDate       string         `json:"due_date"`
	PeriodFrom    string         `json:"period_from"`
	PeriodTo      string         `json:"period_to"`
	Currency      string         `json:"currency"`
	SubtotalCents int64          `json:"subtotal_cents"`
	TaxBP         int            `json:"tax_bp"`
	TaxCents      int64          `json:"tax_cents"`
	TotalCents    int64          `json:"total_cents"`
	Notes         string         `json:"notes"`
	SentAt        *string        `json:"sent_at"`
	PaidAt        *string        `json:"paid_at"`
	Lines         []billing.Line `json:"lines,omitempty"`
}

const invoiceSelect = `SELECT i.id, i.client_id, c.name, c.email, c.address, i.number, i.status, i.issue_date::text,
       i.due_date::text, i.period_from::text, i.period_to::text, i.currency, i.subtotal_cents, i.tax_bp,
       i.tax_cents, i.total_cents, i.notes,
       to_char(i.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       to_char(i.paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  FROM invoices i JOIN clients c ON c.id = i.client_id`

func scanInvoices(rows pgx.Rows) ([]Invoice, error) {
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Invoice, error) {
		var i Invoice
		err := r.Scan(&i.ID, &i.ClientID, &i.ClientName, &i.ClientEmail, &i.ClientAddress, &i.Number, &i.Status,
			&i.IssueDate, &i.DueDate, &i.PeriodFrom, &i.PeriodTo, &i.Currency, &i.SubtotalCents, &i.TaxBP,
			&i.TaxCents, &i.TotalCents, &i.Notes, &i.SentAt, &i.PaidAt)
		return i, err
	})
}

func (s *Store) ListInvoices(ctx context.Context, bizID string) ([]Invoice, error) {
	rows, err := s.pool.Query(ctx, invoiceSelect+` WHERE i.business_id = $1 ORDER BY i.issue_date DESC, i.number DESC`, bizID)
	if err != nil {
		return nil, err
	}
	return scanInvoices(rows)
}

func (s *Store) GetInvoice(ctx context.Context, bizID, id string) (Invoice, error) {
	rows, err := s.pool.Query(ctx, invoiceSelect+` WHERE i.business_id = $1 AND i.id = $2`, bizID, id)
	if err != nil {
		return Invoice{}, err
	}
	list, err := scanInvoices(rows)
	if err != nil {
		return Invoice{}, err
	}
	if len(list) == 0 {
		return Invoice{}, ErrNotFound
	}
	inv := list[0]
	lrows, err := s.pool.Query(ctx,
		`SELECT l.description, COALESCE(l.user_id::text, ''), COALESCE(u.display_name, ''), COALESCE(l.task_id::text, ''),
		        l.seconds, l.rate_cents, l.amount_cents
		   FROM invoice_lines l LEFT JOIN users u ON u.id = l.user_id
		  WHERE l.invoice_id = $1 ORDER BY l.position`, id)
	if err != nil {
		return inv, err
	}
	inv.Lines, err = pgx.CollectRows(lrows, func(r pgx.CollectableRow) (billing.Line, error) {
		var l billing.Line
		err := r.Scan(&l.Description, &l.UserID, &l.UserName, &l.TaskID, &l.Seconds, &l.RateCents, &l.AmountCents)
		return l, err
	})
	return inv, err
}

type entryQuerier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

// unbilledEntries returns a client's billable, not-yet-invoiced time in a period,
// with each entry's rate resolved.
func (s *Store) unbilledEntries(ctx context.Context, q entryQuerier, bizID, clientID, from, to string) ([]billing.Entry, error) {
	history, err := s.rateHistory(ctx, q, bizID)
	if err != nil {
		return nil, err
	}
	rows, err := q.Query(ctx,
		`SELECT e.id, e.user_id, u.display_name, e.task_id, t.title, p.name, e.day::text, e.duration_s, p.rate_cents
		   FROM time_entries e
		   JOIN users u ON u.id = e.user_id
		   JOIN tasks t ON t.id = e.task_id
		   JOIN projects p ON p.id = t.project_id
		  WHERE e.business_id = $1 AND p.client_id = $2 AND p.billable AND e.invoice_id IS NULL
		    AND e.day BETWEEN $3::date AND $4::date
		  ORDER BY e.day, e.id`, bizID, clientID, from, to)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (billing.Entry, error) {
		var e billing.Entry
		var projectRate *int
		err := r.Scan(&e.ID, &e.UserID, &e.UserName, &e.TaskID, &e.TaskTitle, &e.ProjectName, &e.Day, &e.Seconds, &projectRate)
		e.RateCents, e.HasRate = billing.EntryRate(projectRate, history, e.UserID, e.Day)
		return e, err
	})
}

// PreviewInvoice shows what an invoice for a client and period would contain.
func (s *Store) PreviewInvoice(ctx context.Context, bizID, clientID, from, to string, taxBP int) (billing.Draft, error) {
	entries, err := s.unbilledEntries(ctx, s.pool, bizID, clientID, from, to)
	if err != nil {
		return billing.Draft{}, err
	}
	return billing.BuildDraft(entries, taxBP), nil
}

// NewInvoice is what the owner fills in to create an invoice.
type NewInvoice struct {
	ClientID  string
	From, To  string
	IssueDate string
	DueDate   string
	TaxBP     int
	Notes     string
}

// CreateInvoice builds a draft invoice from the unbilled time, freezes the rates on
// its lines and locks the entries — all in one transaction, numbered from the
// workspace counter. Returns ErrNotFound when the client isn't in the workspace and
// ErrConflict when there's no unbilled time.
func (s *Store) CreateInvoice(ctx context.Context, bizID string, n NewInvoice) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var currency string
	var next int
	// Row lock: concurrent invoices get distinct numbers and can't both grab the same time.
	if err := tx.QueryRow(ctx, `SELECT currency, invoice_next_number FROM businesses WHERE id = $1 FOR UPDATE`, bizID).
		Scan(&currency, &next); err != nil {
		return "", err
	}
	var ok bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM clients WHERE business_id = $1 AND id = $2)`,
		bizID, n.ClientID).Scan(&ok); err != nil {
		return "", err
	}
	if !ok {
		return "", ErrNotFound
	}
	entries, err := s.unbilledEntries(ctx, tx, bizID, n.ClientID, n.From, n.To)
	if err != nil {
		return "", err
	}
	if len(entries) == 0 {
		return "", ErrConflict
	}
	d := billing.BuildDraft(entries, n.TaxBP)

	var id string
	if err := tx.QueryRow(ctx,
		`INSERT INTO invoices (business_id, client_id, number, issue_date, due_date, period_from, period_to, currency,
		                       subtotal_cents, tax_bp, tax_cents, total_cents, notes)
		 VALUES ($1, $2, $3, $4::date, $5::date, $6::date, $7::date, $8, $9, $10, $11, $12, $13) RETURNING id`,
		bizID, n.ClientID, billing.InvoiceNumber(next), n.IssueDate, n.DueDate, n.From, n.To, currency,
		d.SubtotalCents, n.TaxBP, d.TaxCents, d.TotalCents, n.Notes).Scan(&id); err != nil {
		return "", err
	}
	for i, l := range d.Lines {
		if _, err := tx.Exec(ctx,
			`INSERT INTO invoice_lines (invoice_id, position, description, user_id, task_id, seconds, rate_cents, amount_cents)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			id, i, l.Description, l.UserID, l.TaskID, l.Seconds, l.RateCents, l.AmountCents); err != nil {
			return "", err
		}
	}
	if _, err := tx.Exec(ctx,
		`UPDATE time_entries SET invoice_id = $2 WHERE business_id = $3 AND id = ANY($1::uuid[]) AND invoice_id IS NULL`,
		d.EntryIDs, id, bizID); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `UPDATE businesses SET invoice_next_number = invoice_next_number + 1 WHERE id = $1`, bizID); err != nil {
		return "", err
	}
	return id, tx.Commit(ctx)
}

// InvoiceUpdate changes an invoice's status and/or its editable fields. Due date,
// tax and notes can only change while it's a draft.
type InvoiceUpdate struct {
	Status  *string
	DueDate *string
	TaxBP   *int
	Notes   *string
}

// UpdateInvoice applies u. Voiding releases the invoice's time so it can be billed
// again. Returns ErrConflict for an invalid status change or editing a non-draft.
func (s *Store) UpdateInvoice(ctx context.Context, bizID, id string, u InvoiceUpdate) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var status string
	var subtotal int64
	err = tx.QueryRow(ctx, `SELECT status, subtotal_cents FROM invoices WHERE business_id = $1 AND id = $2 FOR UPDATE`,
		bizID, id).Scan(&status, &subtotal)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if u.DueDate != nil || u.TaxBP != nil || u.Notes != nil {
		if status != "draft" {
			return ErrConflict
		}
		if u.DueDate != nil {
			if _, err := tx.Exec(ctx, `UPDATE invoices SET due_date = $2::date WHERE id = $1`, id, *u.DueDate); err != nil {
				return err
			}
		}
		if u.Notes != nil {
			if _, err := tx.Exec(ctx, `UPDATE invoices SET notes = $2 WHERE id = $1`, id, *u.Notes); err != nil {
				return err
			}
		}
		if u.TaxBP != nil {
			tax := billing.Tax(subtotal, *u.TaxBP)
			if _, err := tx.Exec(ctx, `UPDATE invoices SET tax_bp = $2, tax_cents = $3, total_cents = subtotal_cents + $3 WHERE id = $1`,
				id, *u.TaxBP, tax); err != nil {
				return err
			}
		}
	}
	if u.Status != nil && *u.Status != status {
		if !billing.NextStatus(status, *u.Status) {
			return ErrConflict
		}
		now := time.Now()
		switch *u.Status {
		case "sent":
			_, err = tx.Exec(ctx, `UPDATE invoices SET status = 'sent', sent_at = COALESCE(sent_at, $2), paid_at = NULL WHERE id = $1`, id, now)
		case "paid":
			_, err = tx.Exec(ctx, `UPDATE invoices SET status = 'paid', paid_at = $2 WHERE id = $1`, id, now)
		case "void":
			if _, err = tx.Exec(ctx, `UPDATE invoices SET status = 'void' WHERE id = $1`, id); err == nil {
				_, err = tx.Exec(ctx, `UPDATE time_entries SET invoice_id = NULL WHERE invoice_id = $1`, id)
			}
		}
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// DeleteInvoice removes a draft and releases its time. Sent/paid invoices must be
// voided instead (ErrConflict) so the numbering keeps an audit trail.
func (s *Store) DeleteInvoice(ctx context.Context, bizID, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var status string
	err = tx.QueryRow(ctx, `SELECT status FROM invoices WHERE business_id = $1 AND id = $2 FOR UPDATE`, bizID, id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if status != "draft" {
		return ErrConflict
	}
	// time_entries.invoice_id is ON DELETE SET NULL, so the time is released.
	if _, err := tx.Exec(ctx, `DELETE FROM invoices WHERE id = $1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
