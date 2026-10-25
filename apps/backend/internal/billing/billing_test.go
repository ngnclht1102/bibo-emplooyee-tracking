package billing

import "testing"

func TestMemberRate(t *testing.T) {
	h := []Rate{
		{UserID: "a", RateCents: 2000, EffectiveFrom: "2026-01-01"},
		{UserID: "a", RateCents: 2500, EffectiveFrom: "2026-06-01"},
		{UserID: "b", RateCents: 9999, EffectiveFrom: "2020-01-01"},
	}
	cases := []struct {
		user, day string
		want      int
		ok        bool
	}{
		{"a", "2025-12-31", 0, false},
		{"a", "2026-01-01", 2000, true},
		{"a", "2026-05-31", 2000, true},
		{"a", "2026-06-01", 2500, true},
		{"a", "2027-01-01", 2500, true},
		{"c", "2026-06-01", 0, false},
	}
	for _, c := range cases {
		got, ok := MemberRate(h, c.user, c.day)
		if got != c.want || ok != c.ok {
			t.Errorf("%s %s: got %d,%v want %d,%v", c.user, c.day, got, ok, c.want, c.ok)
		}
	}
	p := 5000
	if r, ok := EntryRate(&p, h, "a", "2026-07-01"); r != 5000 || !ok {
		t.Errorf("project rate must win, got %d", r)
	}
	zero := 0
	if r, ok := EntryRate(&zero, h, "a", "2026-07-01"); r != 0 || !ok {
		t.Errorf("a 0 project rate is a real rate, got %d,%v", r, ok)
	}
}

func TestMoney(t *testing.T) {
	if got := Amount(3600, 2500); got != 2500 {
		t.Errorf("1h at 25.00 = %d", got)
	}
	if got := Amount(90*60, 2000); got != 3000 {
		t.Errorf("1.5h at 20.00 = %d", got)
	}
	if got := Amount(1, 1800); got != 1 { // 0.5 cent rounds up
		t.Errorf("half cent = %d", got)
	}
	if got := Amount(1, 1799); got != 0 {
		t.Errorf("below half cent = %d", got)
	}
	if got := Tax(10000, 1000); got != 1000 {
		t.Errorf("10%% of 100.00 = %d", got)
	}
	if got := Tax(5, 1000); got != 1 { // 0.5 → 1
		t.Errorf("tax rounding = %d", got)
	}
	if InvoiceNumber(7) != "INV-0007" || InvoiceNumber(12345) != "INV-12345" {
		t.Error("invoice number format")
	}
}

func TestBuildDraft(t *testing.T) {
	entries := []Entry{
		{ID: "1", UserID: "u2", UserName: "Zed", TaskID: "t1", TaskTitle: "API", ProjectName: "Web", Seconds: 1800, RateCents: 4000, HasRate: true},
		{ID: "2", UserID: "u1", UserName: "Ann", TaskID: "t1", TaskTitle: "API", ProjectName: "Web", Seconds: 3600, RateCents: 3000, HasRate: true},
		{ID: "3", UserID: "u1", UserName: "Ann", TaskID: "t1", TaskTitle: "API", ProjectName: "Web", Seconds: 1800, RateCents: 3000, HasRate: true},
		// Same person and task after a raise → its own line.
		{ID: "4", UserID: "u1", UserName: "Ann", TaskID: "t1", TaskTitle: "API", ProjectName: "Web", Seconds: 3600, RateCents: 3500, HasRate: true},
		{ID: "5", UserID: "u3", UserName: "Bob", TaskID: "t0", TaskTitle: "Logo", ProjectName: "Brand", Seconds: 600, HasRate: false},
	}
	d := BuildDraft(entries, 1000)
	if len(d.Lines) != 4 {
		t.Fatalf("lines = %d: %+v", len(d.Lines), d.Lines)
	}
	if d.Lines[0].Description != "Brand · Logo — Bob" || d.Lines[1].UserName != "Ann" || d.Lines[3].UserName != "Zed" {
		t.Errorf("order: %+v", d.Lines)
	}
	if d.Lines[1].Seconds != 5400 || d.Lines[1].AmountCents != 4500 {
		t.Errorf("Ann merged line: %+v", d.Lines[1])
	}
	// 0 + 4500 + 3500 + 2000 = 10000; tax 10% = 1000
	if d.SubtotalCents != 10000 || d.TaxCents != 1000 || d.TotalCents != 11000 {
		t.Errorf("totals: %+v", d)
	}
	if d.Seconds != 11400 || len(d.EntryIDs) != 5 {
		t.Errorf("seconds/entries: %d %v", d.Seconds, d.EntryIDs)
	}
	if len(d.MissingRates) != 1 || d.MissingRates[0] != "Bob" {
		t.Errorf("missing rates: %v", d.MissingRates)
	}
	if e := BuildDraft(nil, 0); len(e.Lines) != 0 || e.TotalCents != 0 {
		t.Error("empty draft")
	}
}

func TestNextStatus(t *testing.T) {
	ok := [][2]string{{"draft", "sent"}, {"sent", "paid"}, {"paid", "sent"}, {"draft", "void"}, {"sent", "void"}, {"paid", "void"}}
	bad := [][2]string{{"draft", "paid"}, {"void", "sent"}, {"void", "draft"}, {"sent", "draft"}, {"paid", "paid"}, {"draft", "bogus"}}
	for _, c := range ok {
		if !NextStatus(c[0], c[1]) {
			t.Errorf("%s → %s should be allowed", c[0], c[1])
		}
	}
	for _, c := range bad {
		if NextStatus(c[0], c[1]) {
			t.Errorf("%s → %s should be refused", c[0], c[1])
		}
	}
	if !ValidCurrency("VND") || ValidCurrency("usd") || ValidCurrency("US") {
		t.Error("currency check")
	}
}
