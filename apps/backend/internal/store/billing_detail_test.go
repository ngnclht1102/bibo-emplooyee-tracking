package store

import (
	"context"
	"os"
	"testing"

	"ctracking/backend/internal/db"
)

// TaskDetail is pure SQL across the billing tables and what the trackers recorded,
// so it can only be checked against a real Postgres. Point CTRACKING_TEST_DB at a
// throwaway cluster (never a real database — this test writes and deletes rows):
//
//	initdb -D /tmp/pg -U postgres --auth=scram-sha-256 --pwfile=<(echo pw)
//	pg_ctl -D /tmp/pg -o "-p 5499 -c unix_socket_directories=''" start
//	CTRACKING_TEST_DB='postgres://postgres:pw@127.0.0.1:5499/postgres' go test ./internal/store
func TestTaskDetail(t *testing.T) {
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

	// ── fixtures ──────────────────────────────────────────────────────────
	owner := one(`INSERT INTO users (email, password_hash, display_name) VALUES ('ctr16-owner@test.local', 'x', 'Owner O') RETURNING id`)
	member := one(`INSERT INTO users (email, password_hash, display_name) VALUES ('ctr16-member@test.local', 'x', 'Member M') RETURNING id`)
	biz := one(`INSERT INTO businesses (name, owner_user_id, kind) VALUES ('CTR16 Team', $1, 'team') RETURNING id`, owner)
	defer func() {
		// The whole fixture hangs off these two users (businesses, projects, tasks,
		// entries and the tracker rows all cascade), so the DB is clean afterwards.
		exec(`DELETE FROM users WHERE id = ANY($1)`, []string{owner, member})
	}()
	exec(`INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, 'owner'), ($3, $2, 'employee')`, owner, biz, member)
	project := one(`INSERT INTO projects (business_id, name) VALUES ($1, 'Website') RETURNING id`, biz)
	task := one(`INSERT INTO tasks (business_id, project_id, title, assignee_id, created_by) VALUES ($1, $2, 'Redesign home', $3, $3) RETURNING id`, biz, project, member)
	other := one(`INSERT INTO tasks (business_id, project_id, title) VALUES ($1, $2, 'Unrelated') RETURNING id`, biz, project)
	device := one(`SELECT gen_random_uuid()::text`)

	// The member ran a timer 09:00–09:40 UTC and 30 minutes of it were active.
	exec(`INSERT INTO time_entries (business_id, user_id, task_id, day, duration_s, source, started_at, ended_at)
	      VALUES ($1, $2, $3, '2026-10-20', 1800, 'timer', '2026-10-20T09:00:00Z', '2026-10-20T09:40:00Z')`, biz, member, task)
	// The owner logged 10 minutes by hand: time but no window, so no shots/keys.
	exec(`INSERT INTO time_entries (business_id, user_id, task_id, day, duration_s, source)
	      VALUES ($1, $2, $3, '2026-10-20', 600, 'manual')`, biz, owner, task)
	// Time on another task must not leak into this one.
	exec(`INSERT INTO time_entries (business_id, user_id, task_id, day, duration_s, source, started_at, ended_at)
	      VALUES ($1, $2, $3, '2026-10-20', 900, 'timer', '2026-10-20T11:00:00Z', '2026-10-20T11:15:00Z')`, biz, member, other)

	ks := func(ts int64, count int) {
		exec(`INSERT INTO keystroke_buckets (client_uuid, user_id, business_id, device_id, ts_bucket, count, client_updated_at)
		      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 0)`, member, biz, device, ts, count)
	}
	const h9 = 1792486800 // 2026-10-20T09:00:00Z
	ks(h9+600, 100)       // 09:10 — inside the window
	ks(h9+1800, 50)       // 09:30 — inside the window
	ks(h9+18000, 50)      // 14:00 — same day, other work
	ks(h9+32400, 70)      // 18:00 — still the 20th in UTC, the 21st at +07:00
	ks(h9+7200, 999)      // 11:00 — inside the *other* task's window

	shot := func(ts int64) {
		exec(`INSERT INTO screenshots (client_uuid, user_id, business_id, device_id, ts, file_path, byte_size, width, height, display_id, client_updated_at)
		      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'x.webp', 100, 1440, 900, 1, 0)`, member, biz, device, ts)
	}
	shot(h9 + 300)   // 09:05 — inside
	shot(h9 + 2100)  // 09:35 — inside
	shot(h9 + 18000) // 14:00 — outside
	shot(h9 + 7200)  // 11:00 — the other task's window

	// ── UTC viewer ────────────────────────────────────────────────────────
	d, err := s.TaskDetail(ctx, biz, task, 0, 100)
	if err != nil {
		t.Fatalf("TaskDetail: %v", err)
	}
	if d.Task.Title != "Redesign home" || d.Task.AssigneeName != "Member M" {
		t.Errorf("task = %q / %q", d.Task.Title, d.Task.AssigneeName)
	}
	if len(d.Entries) != 2 {
		t.Errorf("entries = %d, want 2 (the other task's time must not show)", len(d.Entries))
	}
	if len(d.Stats) != 2 {
		t.Fatalf("stats = %d, want 2", len(d.Stats))
	}
	// Ordered by logged time, so the member (30m) comes before the owner (10m).
	m, o := d.Stats[0], d.Stats[1]
	if m.UserID != member || m.Seconds != 1800 {
		t.Errorf("member stat = %+v", m)
	}
	if m.Keystrokes != 150 {
		t.Errorf("keystrokes in window = %d, want 150", m.Keystrokes)
	}
	// The denominator is everything they typed that day, whatever they typed it on
	// (100+50 in the window, 50 later, 70 at 18:00, 999 on the other task).
	if m.KeystrokesDay != 1269 {
		t.Errorf("keystrokes that day (UTC) = %d, want 1269", m.KeystrokesDay)
	}
	if m.Shots != 2 {
		t.Errorf("shots in window = %d, want 2", m.Shots)
	}
	if o.UserID != owner || o.Seconds != 600 || o.Keystrokes != 0 || o.Shots != 0 {
		t.Errorf("owner stat = %+v, want 600s logged by hand and nothing tracked", o)
	}
	if d.ShotTotal != 2 || len(d.Screenshots) != 2 {
		t.Errorf("screenshots = %d / total %d, want 2", len(d.Screenshots), d.ShotTotal)
	}
	if len(d.Screenshots) == 2 && d.Screenshots[0].Ts < d.Screenshots[1].Ts {
		t.Error("screenshots must come back newest first")
	}
	if len(d.Screenshots) > 0 && d.Screenshots[0].UserName != "Member M" {
		t.Errorf("screenshot owner = %q", d.Screenshots[0].UserName)
	}

	// ── +07:00 viewer: 18:00 UTC belongs to the next local day ────────────
	d, err = s.TaskDetail(ctx, biz, task, 7*60, 100)
	if err != nil {
		t.Fatalf("TaskDetail(+07:00): %v", err)
	}
	if got := d.Stats[0].KeystrokesDay; got != 1199 {
		t.Errorf("keystrokes that day (+07:00) = %d, want 1199 (the 18:00 bucket moved)", got)
	}
	if d.Stats[0].Keystrokes != 150 {
		t.Errorf("the window itself must not move with the time zone: %d", d.Stats[0].Keystrokes)
	}

	// A task with nothing on it still answers.
	if d, err := s.TaskDetail(ctx, biz, other, 0, 100); err != nil {
		t.Fatalf("TaskDetail(other): %v", err)
	} else if len(d.Stats) != 1 || d.Stats[0].Shots != 1 {
		t.Errorf("other task = %+v", d.Stats)
	}
}
