package store

import (
	"context"
	"os"
	"testing"

	"ctracking/backend/internal/db"
)

// Ticket 163: a project is open to the whole workspace unless it is limited to
// selected people. Needs a real Postgres — point CTRACKING_TEST_DB at a throwaway
// cluster (see TestTaskDetail for how).
func TestProjectMembers(t *testing.T) {
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

	owner := one(`INSERT INTO users (email, password_hash, display_name) VALUES ('pm-owner@test.local', 'x', 'Owner O') RETURNING id`)
	ana := one(`INSERT INTO users (email, password_hash, display_name) VALUES ('pm-ana@test.local', 'x', 'Ana A') RETURNING id`)
	bo := one(`INSERT INTO users (email, password_hash, display_name) VALUES ('pm-bo@test.local', 'x', 'Bo B') RETURNING id`)
	outsider := one(`INSERT INTO users (email, password_hash, display_name) VALUES ('pm-out@test.local', 'x', 'Out X') RETURNING id`)
	biz := one(`INSERT INTO businesses (name, owner_user_id, kind) VALUES ('PM Team', $1, 'team') RETURNING id`, owner)
	defer exec(`DELETE FROM users WHERE id = ANY($1)`, []string{owner, ana, bo, outsider})
	exec(`INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, 'owner'), ($3, $2, 'employee'), ($4, $2, 'employee')`,
		owner, biz, ana, bo)

	open, err := s.SaveProject(ctx, biz, Project{Name: "Open house", Billable: true})
	if err != nil {
		t.Fatalf("SaveProject open: %v", err)
	}
	if open.Restricted || len(open.MemberIDs) != 0 {
		t.Errorf("new project = restricted %v, members %v, want open with none", open.Restricted, open.MemberIDs)
	}

	// Limited to Ana. The outsider is not a member of the workspace, so it is dropped.
	limited, err := s.SaveProject(ctx, biz, Project{Name: "Secret sauce", Billable: true,
		Restricted: true, MemberIDs: []string{ana, outsider}})
	if err != nil {
		t.Fatalf("SaveProject limited: %v", err)
	}
	if !limited.Restricted || len(limited.MemberIDs) != 1 || limited.MemberIDs[0] != ana {
		t.Fatalf("limited project = restricted %v, members %v, want only Ana", limited.Restricted, limited.MemberIDs)
	}

	names := func(forUser string) []string {
		t.Helper()
		list, err := s.ListProjects(ctx, biz, forUser)
		if err != nil {
			t.Fatalf("ListProjects(%q): %v", forUser, err)
		}
		out := []string{}
		for _, p := range list {
			out = append(out, p.Name)
		}
		return out
	}
	if got := names(""); len(got) != 2 {
		t.Errorf("owner view = %v, want both projects", got)
	}
	if got := names(ana); len(got) != 2 {
		t.Errorf("Ana's view = %v, want both projects", got)
	}
	if got := names(bo); len(got) != 1 || got[0] != "Open house" {
		t.Errorf("Bo's view = %v, want only the open project", got)
	}

	for _, tc := range []struct {
		who, project string
		want         bool
	}{
		{ana, limited.ID, true},
		{bo, limited.ID, false},
		{bo, open.ID, true},
		{bo, "", true}, // no project at all
	} {
		got, err := s.ProjectAllows(ctx, biz, tc.project, tc.who)
		if err != nil {
			t.Fatalf("ProjectAllows: %v", err)
		}
		if got != tc.want {
			t.Errorf("ProjectAllows(project %q, user %q) = %v, want %v", tc.project, tc.who, got, tc.want)
		}
	}

	// Tasks follow their project.
	secret, err := s.SaveTask(ctx, biz, owner, Task{ProjectID: limited.ID, Title: "Mix the sauce", Status: "open", AssigneeID: &ana})
	if err != nil {
		t.Fatalf("SaveTask in the limited project: %v", err)
	}
	if _, err := s.SaveTask(ctx, biz, owner, Task{ProjectID: open.ID, Title: "Sweep the floor", Status: "open"}); err != nil {
		t.Fatalf("SaveTask in the open project: %v", err)
	}
	if _, err := s.SaveTask(ctx, biz, bo, Task{Title: "Fix the printer", Status: "open", AssigneeID: &bo}); err != nil {
		t.Fatalf("SaveTask without a project: %v", err)
	}
	titles := func(forUser string) []string {
		t.Helper()
		list, err := s.ListTasks(ctx, biz, true, forUser)
		if err != nil {
			t.Fatalf("ListTasks(%q): %v", forUser, err)
		}
		out := []string{}
		for _, x := range list {
			out = append(out, x.Title)
		}
		return out
	}
	if got := titles(""); len(got) != 3 {
		t.Errorf("owner task list = %v, want all three", got)
	}
	if got := titles(ana); len(got) != 3 {
		t.Errorf("Ana's task list = %v, want all three", got)
	}
	got := titles(bo)
	if len(got) != 2 {
		t.Errorf("Bo's task list = %v, want the open-project and project-less tasks", got)
	}
	for _, x := range got {
		if x == "Mix the sauce" {
			t.Errorf("Bo sees the limited project's task: %v", got)
		}
	}
	if ok, err := s.TaskAllows(ctx, biz, secret.ID, bo); err != nil || ok {
		t.Errorf("TaskAllows(secret task, Bo) = %v, %v; want false", ok, err)
	}
	if ok, err := s.TaskAllows(ctx, biz, secret.ID, ana); err != nil || !ok {
		t.Errorf("TaskAllows(secret task, Ana) = %v, %v; want true", ok, err)
	}

	// Opening the project up again keeps the list, so the switch can be flipped back.
	reopened, err := s.SaveProject(ctx, biz, Project{ID: limited.ID, Name: "Secret sauce", Billable: true, Restricted: false})
	if err != nil {
		t.Fatalf("SaveProject reopen: %v", err)
	}
	if reopened.Restricted || len(reopened.MemberIDs) != 1 {
		t.Errorf("reopened = restricted %v, members %v; want open, Ana kept", reopened.Restricted, reopened.MemberIDs)
	}
	if got := titles(bo); len(got) != 3 {
		t.Errorf("Bo's task list after reopening = %v, want all three", got)
	}

	// An explicit empty list clears the allow-list.
	cleared, err := s.SaveProject(ctx, biz, Project{ID: limited.ID, Name: "Secret sauce", Billable: true, MemberIDs: []string{}})
	if err != nil {
		t.Fatalf("SaveProject clear: %v", err)
	}
	if len(cleared.MemberIDs) != 0 {
		t.Errorf("cleared members = %v, want none", cleared.MemberIDs)
	}
}
