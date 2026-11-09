package store

import (
	"context"
	"os"
	"strings"
	"testing"

	"ctracking/backend/internal/db"
)

// CTR-37: a task can have no project at all. Time on it is billable at the member's
// own rate, since only a project can say otherwise. Needs a real Postgres — point
// CTRACKING_TEST_DB at a throwaway cluster (see TestTaskDetail for how).
func TestTaskWithoutProject(t *testing.T) {
	dsn := os.Getenv("CTRACKING_TEST_DB")
	if dsn == "" {
		t.Skip("set CTRACKING_TEST_DB to a throwaway Postgres to run this")
	}
	if err := db.Migrate(dsn); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	s := New(pool)

	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	one := func(sql string, args ...any) string {
		t.Helper()
		var id string
		if err := pool.QueryRow(ctx, sql, args...).Scan(&id); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
		return id
	}

	owner := one(`INSERT INTO users (email, password_hash, display_name) VALUES ('ctr37-owner@test.local', 'x', 'Owner O') RETURNING id`)
	member := one(`INSERT INTO users (email, password_hash, display_name) VALUES ('ctr37-member@test.local', 'x', 'Member M') RETURNING id`)
	biz := one(`INSERT INTO businesses (name, owner_user_id, kind) VALUES ('CTR37 Team', $1, 'team') RETURNING id`, owner)
	defer exec(`DELETE FROM users WHERE id = ANY($1)`, []string{owner, member})
	exec(`INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, 'owner'), ($3, $2, 'employee')`, owner, biz, member)
	exec(`INSERT INTO member_rates (business_id, user_id, rate_cents, effective_from) VALUES ($1, $2, 5000, '2026-01-01')`, biz, member)

	task, err := s.SaveTask(ctx, biz, member, Task{Title: "Fix the printer", Status: "open", AssigneeID: &member})
	if err != nil {
		t.Fatalf("SaveTask without a project: %v", err)
	}
	if task.ProjectID != "" || task.ProjectName != "" {
		t.Errorf("project = %q / %q, want empty", task.ProjectID, task.ProjectName)
	}

	// It must still be listed, including for the member side (activeOnly), where an
	// archived project would have hidden it.
	list, err := s.ListTasks(ctx, biz, true, "")
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	if len(list) != 1 || list[0].ID != task.ID || list[0].ProjectName != "" {
		t.Fatalf("tasks = %+v", list)
	}

	exec(`INSERT INTO time_entries (business_id, user_id, task_id, day, duration_s) VALUES ($1, $2, $3, '2026-10-20', 3600)`,
		biz, member, task.ID)
	entries, err := s.ListEntries(ctx, biz, EntryFilter{From: "2026-10-01", To: "2026-10-31"})
	if err != nil {
		t.Fatalf("ListEntries: %v", err)
	}
	if len(entries) != 1 || entries[0].ProjectID != "" || !entries[0].Billable {
		t.Fatalf("entries = %+v, want one billable entry with no project", entries)
	}

	// An hour at the member's own rate, described without a leading separator.
	draft, err := s.PreviewInvoice(ctx, biz, member, "2026-10-01", "2026-10-31", 0)
	if err != nil {
		t.Fatalf("PreviewInvoice: %v", err)
	}
	if len(draft.Lines) != 1 || draft.TotalCents != 5000 {
		t.Fatalf("draft = %+v", draft)
	}
	if d := draft.Lines[0].Description; strings.HasPrefix(d, " ·") || !strings.HasPrefix(d, "Fix the printer") {
		t.Errorf("line description = %q", d)
	}

	// Moving it into a project, and back out again, both work.
	moved := one(`INSERT INTO projects (business_id, name) VALUES ($1, 'Office') RETURNING id`, biz)
	task.ProjectID = moved
	if task, err = s.SaveTask(ctx, biz, member, task); err != nil || task.ProjectName != "Office" {
		t.Fatalf("move into project: %v / %+v", err, task)
	}
	task.ProjectID = ""
	if task, err = s.SaveTask(ctx, biz, member, task); err != nil || task.ProjectName != "" {
		t.Fatalf("move out of project: %v / %+v", err, task)
	}
}
