package store

import (
	"context"
	"time"
)

// Business overview for super admins (ticket 149). Everything reads the
// activity_days rollup, never activity_samples directly. Days are UTC calendar days.

// ActiveSecondsMin is the tracked time a person needs on a day to count as active.
const ActiveSecondsMin = 300

// RebuildActivityDays recomputes the whole activity_days rollup from
// activity_samples in one transaction (~3 s on prod's 6M rows). Readers keep seeing
// the previous rows until it commits.
func (s *Store) RebuildActivityDays(ctx context.Context) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, `DELETE FROM activity_days`); err != nil {
		return 0, err
	}
	tag, err := tx.Exec(ctx, `
		INSERT INTO activity_days (day, user_id, business_id, active_s)
		SELECT (to_timestamp(a.ts) AT TIME ZONE 'UTC')::date, a.user_id, a.business_id,
		       LEAST(SUM(a.duration_s), 86400)
		  FROM activity_samples a
		 GROUP BY 1, 2, 3`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), tx.Commit(ctx)
}

type OverviewTotals struct {
	Users           int `json:"users"`
	Signups         int `json:"signups"` // self-registered accounts (no employee membership)
	Members         int `json:"members"` // accounts added to a workspace by an owner
	Workspaces      int `json:"workspaces"`
	TeamWorkspaces  int `json:"team_workspaces"`
	FamilyWorkspace int `json:"family_workspaces"`
}

// OverviewKPIs pairs each headline number with the same number one period earlier
// (DAU: a week before; 30-day figures: the 30 days before; range figures: the
// previous range) so the UI can show a delta.
type OverviewKPIs struct {
	DAU                  int     `json:"dau"`
	DAUPrev              int     `json:"dau_prev"`
	WAU                  int     `json:"wau"`
	MAU                  int     `json:"mau"`
	MAUPrev              int     `json:"mau_prev"`
	Stickiness           float64 `json:"stickiness"` // DAU / MAU, 0..1
	StickinessPrev       float64 `json:"stickiness_prev"`
	NewSignups           int     `json:"new_signups"` // in the selected range
	NewSignupsPrev       int     `json:"new_signups_prev"`
	ActiveWorkspaces     int     `json:"active_workspaces"` // last 30 days
	ActiveWorkspacesPrev int     `json:"active_workspaces_prev"`
	AtRisk               int     `json:"at_risk"`
	Churned              int     `json:"churned"` // went silent within the selected range
	ChurnedTotal         int     `json:"churned_total"`
	AvgTrackedS          int     `json:"avg_tracked_s"` // per active person-day, last 30 days
	AvgTrackedSPrev      int     `json:"avg_tracked_s_prev"`
}

type OverviewDay struct {
	Day              string `json:"day"`
	DAU              int    `json:"dau"`
	WAU              int    `json:"wau"`
	MAU              int    `json:"mau"`
	ActiveWorkspaces int    `json:"active_workspaces"`
	NewSignups       int    `json:"new_signups"`
	NewMembers       int    `json:"new_members"`
	NewWorkspaces    int    `json:"new_workspaces"`
}

// OverviewFunnel follows workspaces created From..To; each step is a subset of the
// previous one.
type OverviewFunnel struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Created   int    `json:"created"`
	FirstData int    `json:"first_data"`
	Activated int    `json:"activated"` // first active day within 7 days of creation
	Week2     int    `json:"week2"`     // …and active again 7–13 days after creation
	TwoPlus   int    `json:"two_plus"`  // …and 2+ people tracked
}

type OverviewFreq struct {
	Bucket string `json:"bucket"` // "1", "2-4", "5-9", "10-19", "20+" active days in 30
	People int    `json:"people"`
}

// OverviewCohort is one signup week; Retained[k] is the share of its workspaces
// active in week k after signup, or nil while that week isn't over.
type OverviewCohort struct {
	Week     string     `json:"week"`
	Size     int        `json:"size"`
	Retained []*float64 `json:"retained"`
}

type OverviewWorkspace struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	Owner      string `json:"owner"`
	OwnerLogin string `json:"owner_login"`
	People     int    `json:"people"`
	CreatedOn  string `json:"created_on"`
	LastActive string `json:"last_active"`
	Status     string `json:"status"` // at_risk | churned
}

type Overview struct {
	AsOf      string              `json:"as_of"` // last complete UTC day
	Days      int                 `json:"days"`
	Totals    OverviewTotals      `json:"totals"`
	KPIs      OverviewKPIs        `json:"kpis"`
	Series    []OverviewDay       `json:"series"`
	Funnel    OverviewFunnel      `json:"funnel"`
	Frequency []OverviewFreq      `json:"frequency"`
	Cohorts   []OverviewCohort    `json:"cohorts"`
	Watchlist []OverviewWorkspace `json:"watchlist"`
}

const cohortWeeks = 9 // week 0 (signup week) … week 8

// GetOverview builds the super-admin Business overview for the last `days` complete
// UTC days.
func (s *Store) GetOverview(ctx context.Context, days int, now time.Time) (Overview, error) {
	today := now.UTC().Truncate(24 * time.Hour)
	asOf := today.AddDate(0, 0, -1)
	start := asOf.AddDate(0, 0, -(days - 1))
	d := func(t time.Time) string { return t.Format("2006-01-02") }
	ov := Overview{AsOf: d(asOf), Days: days}

	// Totals.
	err := s.pool.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM users),
		       (SELECT count(*) FROM users u WHERE NOT EXISTS
		           (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.role = 'employee')),
		       (SELECT count(*) FROM businesses),
		       (SELECT count(*) FROM businesses WHERE kind = 'team'),
		       (SELECT count(*) FROM businesses WHERE kind = 'family')`).
		Scan(&ov.Totals.Users, &ov.Totals.Signups, &ov.Totals.Workspaces,
			&ov.Totals.TeamWorkspaces, &ov.Totals.FamilyWorkspace)
	if err != nil {
		return ov, err
	}
	ov.Totals.Members = ov.Totals.Users - ov.Totals.Signups

	// Daily series. Computed 30 days further back than shown so the KPIs can compare
	// against a month earlier.
	from := start.AddDate(0, 0, -30)
	rows, err := s.pool.Query(ctx, `
		WITH pu AS (  -- active person-days
		  SELECT day, user_id FROM activity_days
		   WHERE day BETWEEN $1::date - 29 AND $2::date
		   GROUP BY day, user_id HAVING SUM(active_s) >= $3),
		bw AS (       -- active workspace-days
		  SELECT DISTINCT day, business_id FROM activity_days
		   WHERE day BETWEEN $1::date AND $2::date AND active_s >= $3),
		su AS (       -- signup day + whether the account is an added member
		  SELECT (u.created_at AT TIME ZONE 'UTC')::date AS day,
		         EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.role = 'employee') AS member
		    FROM users u)
		SELECT g::date,
		       (SELECT count(*) FROM pu WHERE pu.day = g::date),
		       (SELECT count(DISTINCT user_id) FROM pu WHERE pu.day BETWEEN g::date - 6 AND g::date),
		       (SELECT count(DISTINCT user_id) FROM pu WHERE pu.day BETWEEN g::date - 29 AND g::date),
		       (SELECT count(*) FROM bw WHERE bw.day = g::date),
		       (SELECT count(*) FROM su WHERE su.day = g::date AND NOT su.member),
		       (SELECT count(*) FROM su WHERE su.day = g::date AND su.member),
		       (SELECT count(*) FROM businesses b WHERE (b.created_at AT TIME ZONE 'UTC')::date = g::date)
		  FROM generate_series($1::date, $2::date, interval '1 day') g
		 ORDER BY 1`, d(from), d(asOf), ActiveSecondsMin)
	if err != nil {
		return ov, err
	}
	var all []OverviewDay
	for rows.Next() {
		var r OverviewDay
		var day time.Time
		if err := rows.Scan(&day, &r.DAU, &r.WAU, &r.MAU, &r.ActiveWorkspaces,
			&r.NewSignups, &r.NewMembers, &r.NewWorkspaces); err != nil {
			rows.Close()
			return ov, err
		}
		r.Day = d(day)
		all = append(all, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return ov, err
	}
	ov.Series = all[30:]
	last, weekAgo, monthAgo := all[len(all)-1], all[len(all)-8], all[len(all)-31]
	k := &ov.KPIs
	k.DAU, k.DAUPrev, k.WAU = last.DAU, weekAgo.DAU, last.WAU
	k.MAU, k.MAUPrev = last.MAU, monthAgo.MAU
	k.Stickiness, k.StickinessPrev = ratio(last.DAU, last.MAU), ratio(monthAgo.DAU, monthAgo.MAU)

	// Range and 30-day comparisons.
	prevStart := start.AddDate(0, 0, -days)
	err = s.pool.QueryRow(ctx, `
		WITH pd AS (
		  SELECT day, user_id, SUM(active_s) AS s FROM activity_days
		   WHERE day BETWEEN $3::date - 59 AND $3::date
		   GROUP BY day, user_id HAVING SUM(active_s) >= $4)
		SELECT
		  (SELECT count(*) FROM users u WHERE (u.created_at AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $3::date
		      AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.role = 'employee')),
		  (SELECT count(*) FROM users u WHERE (u.created_at AT TIME ZONE 'UTC')::date BETWEEN $2::date AND $1::date - 1
		      AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.role = 'employee')),
		  (SELECT count(DISTINCT business_id) FROM activity_days
		    WHERE day BETWEEN $3::date - 29 AND $3::date AND active_s >= $4),
		  (SELECT count(DISTINCT business_id) FROM activity_days
		    WHERE day BETWEEN $3::date - 59 AND $3::date - 30 AND active_s >= $4),
		  COALESCE((SELECT AVG(s) FROM pd WHERE day > $3::date - 30), 0)::int,
		  COALESCE((SELECT AVG(s) FROM pd WHERE day <= $3::date - 30), 0)::int`,
		d(start), d(prevStart), d(asOf), ActiveSecondsMin).
		Scan(&k.NewSignups, &k.NewSignupsPrev, &k.ActiveWorkspaces, &k.ActiveWorkspacesPrev,
			&k.AvgTrackedS, &k.AvgTrackedSPrev)
	if err != nil {
		return ov, err
	}

	// Workspace lifecycle: at-risk + churned watchlist.
	rows, err = s.pool.Query(ctx, `
		WITH la AS (
		  SELECT business_id, max(day) AS last FROM activity_days
		   WHERE active_s >= $2 GROUP BY business_id)
		SELECT b.id, b.name, b.kind, o.display_name, COALESCE(o.email, o.username, ''),
		       (SELECT count(*) FROM memberships m WHERE m.business_id = b.id),
		       (b.created_at AT TIME ZONE 'UTC')::date, la.last, $1::date - la.last
		  FROM businesses b
		  JOIN la ON la.business_id = b.id
		  JOIN users o ON o.id = b.owner_user_id
		 WHERE $1::date - la.last >= 7
		 ORDER BY la.last DESC`, d(today), ActiveSecondsMin)
	if err != nil {
		return ov, err
	}
	for rows.Next() {
		var w OverviewWorkspace
		var created, lastDay time.Time
		var silent int
		if err := rows.Scan(&w.ID, &w.Name, &w.Kind, &w.Owner, &w.OwnerLogin, &w.People,
			&created, &lastDay, &silent); err != nil {
			rows.Close()
			return ov, err
		}
		w.CreatedOn, w.LastActive = d(created), d(lastDay)
		switch {
		case silent < 14:
			w.Status = "at_risk"
			k.AtRisk++
		default:
			w.Status = "churned"
			k.ChurnedTotal++
			// Churn date = last active + 14 days; count it if that fell in the range.
			if !lastDay.AddDate(0, 0, 14).Before(start) {
				k.Churned++
			} else {
				continue // old churn: keep the list to what's actionable
			}
		}
		ov.Watchlist = append(ov.Watchlist, w)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return ov, err
	}
	if ov.Watchlist == nil {
		ov.Watchlist = []OverviewWorkspace{}
	}

	// Activation funnel: workspaces created in the range that are ≥ 14 days old,
	// so every step had time to happen.
	fTo := today.AddDate(0, 0, -14)
	ov.Funnel.From, ov.Funnel.To = d(start), d(fTo)
	if !fTo.Before(start) {
		err = s.pool.QueryRow(ctx, `
			WITH c AS (
			  SELECT b.id, (b.created_at AT TIME ZONE 'UTC')::date AS created FROM businesses b
			   WHERE (b.created_at AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $2::date),
			f AS (
			  SELECT c.id,
			    EXISTS (SELECT 1 FROM activity_days a WHERE a.business_id = c.id AND a.active_s >= $3) AS first_data,
			    EXISTS (SELECT 1 FROM activity_days a WHERE a.business_id = c.id AND a.active_s >= $3
			             AND a.day BETWEEN c.created AND c.created + 6) AS activated,
			    EXISTS (SELECT 1 FROM activity_days a WHERE a.business_id = c.id AND a.active_s >= $3
			             AND a.day BETWEEN c.created + 7 AND c.created + 13) AS week2,
			    (SELECT count(DISTINCT user_id) FROM activity_days a
			      WHERE a.business_id = c.id AND a.active_s >= $3) >= 2 AS two_plus
			  FROM c)
			SELECT count(*),
			       count(*) FILTER (WHERE first_data),
			       count(*) FILTER (WHERE activated),
			       count(*) FILTER (WHERE activated AND week2),
			       count(*) FILTER (WHERE activated AND week2 AND two_plus)
			  FROM f`, d(start), d(fTo), ActiveSecondsMin).
			Scan(&ov.Funnel.Created, &ov.Funnel.FirstData, &ov.Funnel.Activated,
				&ov.Funnel.Week2, &ov.Funnel.TwoPlus)
		if err != nil {
			return ov, err
		}
	}

	// How often people use it: active days in the last 30 days.
	ov.Frequency = []OverviewFreq{{"1", 0}, {"2-4", 0}, {"5-9", 0}, {"10-19", 0}, {"20+", 0}}
	rows, err = s.pool.Query(ctx, `
		WITH pu AS (
		  SELECT day, user_id FROM activity_days
		   WHERE day BETWEEN $1::date - 29 AND $1::date
		   GROUP BY day, user_id HAVING SUM(active_s) >= $2)
		SELECT n, count(*) FROM (SELECT user_id, count(*) AS n FROM pu GROUP BY user_id) x
		 GROUP BY n`, d(asOf), ActiveSecondsMin)
	if err != nil {
		return ov, err
	}
	for rows.Next() {
		var n, people int
		if err := rows.Scan(&n, &people); err != nil {
			rows.Close()
			return ov, err
		}
		i := 4
		switch {
		case n == 1:
			i = 0
		case n <= 4:
			i = 1
		case n <= 9:
			i = 2
		case n <= 19:
			i = 3
		}
		ov.Frequency[i].People += people
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return ov, err
	}

	// Weekly retention cohorts (ISO weeks, Monday start): the last 10 signup weeks.
	rows, err = s.pool.Query(ctx, `
		WITH c AS (
		  SELECT b.id, date_trunc('week', b.created_at AT TIME ZONE 'UTC')::date AS week
		    FROM businesses b
		   WHERE b.created_at AT TIME ZONE 'UTC' >= date_trunc('week', $1::date::timestamp) - interval '9 weeks')
		SELECT c.week, k, count(*),
		       count(*) FILTER (WHERE EXISTS (
		         SELECT 1 FROM activity_days a WHERE a.business_id = c.id AND a.active_s >= $2
		            AND a.day BETWEEN c.week + 7 * k AND c.week + 7 * k + 6))
		  FROM c CROSS JOIN generate_series(0, $3::int - 1) AS k
		 GROUP BY c.week, k
		 ORDER BY c.week DESC, k`, d(asOf), ActiveSecondsMin, cohortWeeks)
	if err != nil {
		return ov, err
	}
	for rows.Next() {
		var week time.Time
		var kk, size, kept int
		if err := rows.Scan(&week, &kk, &size, &kept); err != nil {
			rows.Close()
			return ov, err
		}
		if len(ov.Cohorts) == 0 || ov.Cohorts[len(ov.Cohorts)-1].Week != d(week) {
			ov.Cohorts = append(ov.Cohorts, OverviewCohort{Week: d(week), Size: size,
				Retained: make([]*float64, cohortWeeks)})
		}
		// Only weeks that are fully over.
		if !week.AddDate(0, 0, 7*kk+6).After(asOf) {
			v := ratio(kept, size)
			ov.Cohorts[len(ov.Cohorts)-1].Retained[kk] = &v
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return ov, err
	}
	if ov.Cohorts == nil {
		ov.Cohorts = []OverviewCohort{}
	}
	return ov, nil
}

func ratio(a, b int) float64 {
	if b == 0 {
		return 0
	}
	return float64(a) / float64(b)
}
