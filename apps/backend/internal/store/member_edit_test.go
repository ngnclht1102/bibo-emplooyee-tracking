package store

import (
	"context"
	"errors"
	"os"
	"testing"

	"ctracking/backend/internal/db"
)

// Ticket 168: an owner can fix a member's details and drop a member from the roster.
// Needs a real Postgres — point CTRACKING_TEST_DB at a throwaway cluster.
func TestUpdateAndRemoveEmployee(t *testing.T) {
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

	owner := one(`INSERT INTO users (email, password_hash, display_name) VALUES ('me-owner@test.local', 'x', 'Owner O') RETURNING id`)
	other := one(`INSERT INTO users (email, password_hash, display_name) VALUES ('me-other@test.local', 'x', 'Other Owner') RETURNING id`)
	biz := one(`INSERT INTO businesses (name, owner_user_id, kind) VALUES ('ME Team', $1, 'team') RETURNING id`, owner)
	otherBiz := one(`INSERT INTO businesses (name, owner_user_id, kind) VALUES ('ME Other', $1, 'team') RETURNING id`, other)
	exec(`INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
		owner, biz, other, otherBiz)
	defer exec(`DELETE FROM users WHERE id = ANY($1)`, []string{owner, other})

	// The reported flow: a member added with the wrong email (ticket 168 / CTR-42).
	megan, _, err := s.CreateEmployee(ctx, owner, &biz, "wrong@test.local", "", "x", "Megan")
	if err != nil {
		t.Fatalf("CreateEmployee: %v", err)
	}
	defer exec(`DELETE FROM users WHERE id = $1`, megan.ID)

	str := func(v string) *string { return &v }

	// Fixing the email in place is what the customer could not do.
	got, err := s.UpdateEmployee(ctx, biz, megan.ID, EmployeeUpdate{
		DisplayName: str("Megan R"), ChangeLogin: true, Email: "Right@Test.Local",
	})
	if err != nil {
		t.Fatalf("UpdateEmployee: %v", err)
	}
	if got.Email != "right@test.local" || got.DisplayName != "Megan R" || got.Username != "" {
		t.Errorf("updated = %+v, want the lowercased new email, the new name and no username", got)
	}

	// Switching to a username clears the email, so the old address is free again.
	if got, err = s.UpdateEmployee(ctx, biz, megan.ID, EmployeeUpdate{ChangeLogin: true, Username: "megan_r"}); err != nil {
		t.Fatalf("UpdateEmployee username: %v", err)
	}
	if got.Username != "megan_r" || got.Email != "" {
		t.Errorf("after username swap = %+v, want username only", got)
	}

	// A login already in use is reported as a conflict, not a 500.
	if _, err := s.UpdateEmployee(ctx, biz, megan.ID, EmployeeUpdate{ChangeLogin: true, Email: "me-other@test.local"}); !errors.Is(err, ErrConflict) {
		t.Errorf("taken email err = %v, want ErrConflict", err)
	}

	// Scoping: another owner's business cannot edit this member, and an owner is not
	// editable through the member path at all.
	if _, err := s.UpdateEmployee(ctx, otherBiz, megan.ID, EmployeeUpdate{DisplayName: str("Hacked")}); !errors.Is(err, ErrNotFound) {
		t.Errorf("cross-business edit err = %v, want ErrNotFound", err)
	}
	if _, err := s.UpdateEmployee(ctx, biz, owner, EmployeeUpdate{DisplayName: str("Hacked")}); !errors.Is(err, ErrNotFound) {
		t.Errorf("editing the owner err = %v, want ErrNotFound", err)
	}

	// Removal detaches only: the account survives, the roster drops them, and a
	// restricted project forgets them.
	proj := one(`INSERT INTO projects (business_id, name, billable, restricted) VALUES ($1, 'Secret', true, true) RETURNING id`, biz)
	exec(`INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)`, proj, megan.ID)

	if err := s.RemoveEmployee(ctx, otherBiz, megan.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("cross-business remove err = %v, want ErrNotFound", err)
	}
	if err := s.RemoveEmployee(ctx, biz, megan.ID); err != nil {
		t.Fatalf("RemoveEmployee: %v", err)
	}
	if err := s.RemoveEmployee(ctx, biz, megan.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("second remove err = %v, want ErrNotFound", err)
	}

	roster, err := s.ListEmployees(ctx, biz)
	if err != nil {
		t.Fatalf("ListEmployees: %v", err)
	}
	if len(roster) != 0 {
		t.Errorf("roster = %+v, want empty after removal", roster)
	}
	var users, pm int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE id = $1`, megan.ID).Scan(&users); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_members WHERE user_id = $1`, megan.ID).Scan(&pm); err != nil {
		t.Fatalf("count project_members: %v", err)
	}
	if users != 1 || pm != 0 {
		t.Errorf("after removal: users=%d project_members=%d, want the account kept (1) and the allow-list cleared (0)", users, pm)
	}
}
