// Package billing holds the pure rules for billing (ticket 152): which hourly rate
// applies to a piece of logged time, how unbilled time becomes invoice lines, and
// the money math. Amounts are integer cents; rounding is half-up.
package billing

import (
	"fmt"
	"regexp"
	"sort"
)

var currencyRe = regexp.MustCompile(`^[A-Z]{3}$`)

// ValidCurrency reports whether c looks like an ISO 4217 code (e.g. USD, VND).
func ValidCurrency(c string) bool { return currencyRe.MatchString(c) }

// Rate is one entry of a member's rate history.
type Rate struct {
	UserID        string
	RateCents     int
	EffectiveFrom string // YYYY-MM-DD
}

// MemberRate returns the member's rate in force on day (the latest EffectiveFrom on
// or before it), or ok=false when none applies yet.
func MemberRate(history []Rate, userID, day string) (cents int, ok bool) {
	best := ""
	for _, r := range history {
		if r.UserID == userID && r.EffectiveFrom <= day && r.EffectiveFrom >= best {
			best, cents, ok = r.EffectiveFrom, r.RateCents, true
		}
	}
	return cents, ok
}

// EntryRate resolves the rate for time logged by userID on day: the project's own
// rate wins, else the member's rate on that day.
func EntryRate(projectRate *int, history []Rate, userID, day string) (cents int, ok bool) {
	if projectRate != nil {
		return *projectRate, true
	}
	return MemberRate(history, userID, day)
}

// Amount is seconds × hourly rate, in cents, rounded half-up.
func Amount(seconds, rateCents int) int64 {
	return (int64(seconds)*int64(rateCents) + 1800) / 3600
}

// Tax is subtotal × basis points, rounded half-up.
func Tax(subtotal int64, taxBP int) int64 {
	return (subtotal*int64(taxBP) + 5000) / 10000
}

// InvoiceNumber formats the n-th invoice of a workspace.
func InvoiceNumber(n int) string { return fmt.Sprintf("INV-%04d", n) }

// Entry is unbilled time ready to be invoiced.
type Entry struct {
	ID          string
	UserID      string
	UserName    string
	TaskID      string
	TaskTitle   string
	ProjectName string
	Day         string
	Seconds     int
	RateCents   int
	HasRate     bool
}

// Line is one invoice line: a task × person × rate, with its entries summed.
type Line struct {
	Description string `json:"description"`
	UserID      string `json:"user_id"`
	UserName    string `json:"user_name"`
	TaskID      string `json:"task_id"`
	Seconds     int    `json:"seconds"`
	RateCents   int    `json:"rate_cents"`
	AmountCents int64  `json:"amount_cents"`
}

// Draft is what an invoice would contain for a set of entries.
type Draft struct {
	Lines         []Line   `json:"lines"`
	EntryIDs      []string `json:"entry_ids"`
	Seconds       int      `json:"seconds"`
	SubtotalCents int64    `json:"subtotal_cents"`
	TaxCents      int64    `json:"tax_cents"`
	TotalCents    int64    `json:"total_cents"`
	// People whose time has no rate (billed at 0) — the owner should set one first.
	MissingRates []string `json:"missing_rates"`
}

// desc is a line's label: "project · task — person", or "task — person" when the
// task has no project (CTR-37).
func desc(project, task, person string) string {
	if project == "" {
		return task + " — " + person
	}
	return project + " · " + task + " — " + person
}

// BuildDraft groups entries into lines (one per task × person × rate, sorted by
// project, task, person) and totals them with tax.
func BuildDraft(entries []Entry, taxBP int) Draft {
	type key struct {
		task, user string
		rate       int
	}
	idx := map[key]int{}
	type acc struct {
		line    Line
		project string
		task    string
	}
	var accs []acc
	missing := map[string]bool{}
	d := Draft{Lines: []Line{}, EntryIDs: []string{}, MissingRates: []string{}}
	for _, e := range entries {
		if !e.HasRate {
			missing[e.UserName] = true
		}
		k := key{e.TaskID, e.UserID, e.RateCents}
		i, ok := idx[k]
		if !ok {
			i = len(accs)
			idx[k] = i
			accs = append(accs, acc{
				line: Line{Description: desc(e.ProjectName, e.TaskTitle, e.UserName),
					UserID: e.UserID, UserName: e.UserName, TaskID: e.TaskID, RateCents: e.RateCents},
				project: e.ProjectName, task: e.TaskTitle,
			})
		}
		accs[i].line.Seconds += e.Seconds
		d.EntryIDs = append(d.EntryIDs, e.ID)
		d.Seconds += e.Seconds
	}
	sort.SliceStable(accs, func(i, j int) bool {
		a, b := accs[i], accs[j]
		if a.project != b.project {
			return a.project < b.project
		}
		if a.task != b.task {
			return a.task < b.task
		}
		return a.line.UserName < b.line.UserName
	})
	for _, a := range accs {
		a.line.AmountCents = Amount(a.line.Seconds, a.line.RateCents)
		d.SubtotalCents += a.line.AmountCents
		d.Lines = append(d.Lines, a.line)
	}
	for n := range missing {
		d.MissingRates = append(d.MissingRates, n)
	}
	sort.Strings(d.MissingRates)
	d.TaxCents = Tax(d.SubtotalCents, taxBP)
	d.TotalCents = d.SubtotalCents + d.TaxCents
	return d
}

// NextStatus reports whether an invoice may move from one status to another, for
// the side making the change (ticket 159): the member who raised it submits a draft
// (draft → sent), and the owner who receives it records payment (sent → paid), takes
// a payment back (paid → sent) or voids it.
func NextStatus(from, to string, byOwner bool) bool {
	switch to {
	case "sent":
		if byOwner {
			return from == "paid"
		}
		return from == "draft"
	case "paid":
		return byOwner && from == "sent"
	case "void":
		return byOwner && (from == "draft" || from == "sent" || from == "paid")
	}
	return false
}
