package messages

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func ts(s string) *time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return &t
}

func TestEligible(t *testing.T) {
	now := *ts("2026-10-01T12:00:00Z")
	owner := Viewer{Roles: []string{"owner"}, Kinds: []string{"team"}, Platform: "macos", Version: "1.5.2", Locale: "vi"}
	employee := Viewer{Roles: []string{"employee"}, Kinds: []string{"team"}, Platform: "windows", Version: "1.5.2", Locale: "en"}
	parent := Viewer{Roles: []string{"owner"}, Kinds: []string{"family"}, Platform: "macos", Version: "1.5.2", Locale: "en"}

	cases := []struct {
		name string
		m    Message
		v    Viewer
		want bool
	}{
		{"no audience = everyone", Message{Active: true, Kind: "announcement"}, employee, true},
		{"paused never shows", Message{Kind: "announcement"}, employee, false},
		{"before start", Message{Active: true, Kind: "announcement", Start: ts("2026-10-02T00:00:00Z")}, owner, false},
		{"after end", Message{Active: true, Kind: "announcement", End: ts("2026-10-01T12:00:00Z")}, owner, false},
		{"role match", Message{Active: true, Kind: "survey", Audience: Audience{Roles: []string{"employee"}}}, employee, true},
		{"role mismatch", Message{Active: true, Kind: "survey", Audience: Audience{Roles: []string{"employee"}}}, owner, false},
		{"platform mismatch", Message{Active: true, Kind: "announcement", Audience: Audience{Platforms: []string{"windows"}}}, owner, false},
		{"locale match", Message{Active: true, Kind: "announcement", Audience: Audience{Locales: []string{"vi"}}}, owner, true},
		{"min version ok", Message{Active: true, Kind: "announcement", Audience: Audience{MinVersion: "1.5.2"}}, owner, true},
		{"min version too old", Message{Active: true, Kind: "announcement", Audience: Audience{MinVersion: "1.5.10"}}, owner, false},
		{"max version exceeded", Message{Active: true, Kind: "announcement", Audience: Audience{MaxVersion: "1.5.1"}}, owner, false},
		{"promo to team owner", Message{Active: true, Kind: "promo"}, owner, true},
		{"promo never to employees", Message{Active: true, Kind: "promo", Audience: Audience{Roles: []string{"employee"}}}, employee, false},
		{"user list match", Message{Active: true, Kind: "announcement", Audience: Audience{Users: []string{"u1", "u2"}}}, Viewer{UserID: "u2"}, true},
		{"user list excludes others", Message{Active: true, Kind: "announcement", Audience: Audience{Users: []string{"u1"}}}, owner, false},
		{"promo never to family", Message{Active: true, Kind: "promo"}, parent, false},
	}
	for _, c := range cases {
		if got := Eligible(&c.m, c.v, now); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}

func survey() *Message {
	return &Message{ID: "s1", Kind: "survey", Content: map[string]Content{"en": {Title: "Quick survey"}}, Fields: []Field{
		{ID: "role", Type: "radio", Required: true, Label: map[string]string{"en": "Role", "vi": "Vai trò"},
			Options: []Option{{Value: "dev", Label: map[string]string{"en": "Developer"}}, {Value: "pm", Label: map[string]string{"en": "PM"}}}},
		{ID: "tools", Type: "checkbox", Label: map[string]string{"en": "Tools"},
			Options: []Option{{Value: "a", Label: map[string]string{"en": "A"}}, {Value: "b", Label: map[string]string{"en": "B"}}}},
		{ID: "nps", Type: "nps", Required: true, Label: map[string]string{"en": "Recommend?"}},
		{ID: "note", Type: "textarea", Label: map[string]string{"en": "Anything else?"}},
	}}
}

func TestValidateAnswers(t *testing.T) {
	m := survey()
	good := map[string]any{"role": "dev", "tools": []any{"a", "b"}, "nps": 9.0, "note": "great"}
	out, err := ValidateAnswers(m, good)
	if err != nil || out["nps"] != 9 || len(out["tools"].([]string)) != 2 {
		t.Fatalf("good answers rejected: %v %v", out, err)
	}
	if _, err := ValidateAnswers(m, map[string]any{"role": "dev", "nps": 7.0}); err != nil {
		t.Errorf("optional fields omitted: %v", err)
	}
	bad := []map[string]any{
		{"nps": 9.0},                                     // missing required radio
		{"role": "ceo", "nps": 9.0},                      // not an option
		{"role": "dev", "nps": 11.0},                     // out of range
		{"role": "dev", "nps": 7.5},                      // not whole
		{"role": "dev", "nps": 7.0, "tools": []any{"z"}}, // bad checkbox value
		{"role": "dev", "nps": 7.0, "hack": "x"},         // unknown field
		{"role": "dev", "nps": 7.0, "note": strings.Repeat("x", 2001)},
	}
	for i, a := range bad {
		if _, err := ValidateAnswers(m, a); err == nil {
			t.Errorf("bad answers %d accepted: %v", i, a)
		}
	}
}

func TestResolveFallsBackToEnglish(t *testing.T) {
	r := Resolve(survey(), "vi")
	if r.Title != "Quick survey" || r.Fields[0].Label != "Vai trò" || r.Fields[0].Options[0].Label != "Developer" {
		t.Fatalf("unexpected resolve: %+v", r)
	}
}

func TestValidate(t *testing.T) {
	if err := Validate(survey()); err != nil {
		t.Fatalf("valid survey rejected: %v", err)
	}
	for _, body := range []string{
		`{"id":"a","kind":"news","content":{"en":{"title":"x"}}}`,
		`{"id":"../x","kind":"announcement","content":{"en":{"title":"x"}}}`,
		`{"id":"whatsnew-1.0","kind":"announcement","content":{"en":{"title":"x"}}}`,
		`{"id":"a","kind":"survey","content":{"en":{"title":"x"}}}`,
		`{"id":"a","kind":"announcement","content":{"vi":{"title":"x"}}}`,
		`{"id":"a","kind":"promo","content":{"en":{"title":"x","cta_url":"http://insecure","cta_label":"Go"}}}`,
		`{"id":"a","kind":"promo","content":{"en":{"title":"x","cta_url":"https://ok"}}}`,
		`{"id":"a","kind":"announcement","start":"2026-10-02T00:00:00Z","end":"2026-10-01T00:00:00Z","content":{"en":{"title":"x"}}}`,
		`{"id":"a","kind":"announcement","content":{"en":{"title":"x"}},"fields":[{"id":"f","type":"text","label":{"en":"F"}}]}`,
		`{"id":"a","kind":"survey","content":{"en":{"title":"x"}},"fields":[{"id":"f","type":"radio","label":{"en":"F"}}]}`,
		`{"id":"a","kind":"survey","content":{"en":{"title":"x"}},"fields":[{"id":"f","type":"radio","label":{"en":"F"},"options":[{"value":"a","label":{"en":"A"}},{"value":"a","label":{"en":"B"}}]}]}`,
	} {
		var m Message
		if err := json.Unmarshal([]byte(body), &m); err != nil {
			t.Fatal(err)
		}
		if err := Validate(&m); err == nil {
			t.Errorf("should reject: %s", body)
		}
	}
}

func TestSameStructure(t *testing.T) {
	base := survey().Fields
	relabelled := survey().Fields
	relabelled[0].Label = map[string]string{"en": "Your role?", "fr": "Votre rôle ?"}
	relabelled[0].Options[0].Label = map[string]string{"en": "Engineer"}
	relabelled[2].Required = false
	relabelled[0], relabelled[1] = relabelled[1], relabelled[0] // reordered
	if !SameStructure(base, relabelled) {
		t.Error("wording, required and order changes should be allowed")
	}
	changes := []func(f []Field) []Field{
		func(f []Field) []Field { f[0].Type = "select"; return f },
		func(f []Field) []Field { f[0].Options[0].Value = "engineer"; return f },
		func(f []Field) []Field { f[0].Options = f[0].Options[:1]; return f },
		func(f []Field) []Field { return f[1:] },
		func(f []Field) []Field { f[3].ID = "comment"; return f },
		func(f []Field) []Field { return append(f, Field{ID: "new", Type: "text"}) },
	}
	for i, change := range changes {
		if SameStructure(base, change(survey().Fields)) {
			t.Errorf("structural change %d should be refused", i)
		}
	}
}
