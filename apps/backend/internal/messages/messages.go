// Package messages holds the rules for in-app messages (announcements, surveys,
// promos) shown to the desktop app: validation, audience targeting, locale
// resolution and survey-answer checking. Messages are stored in the database and
// managed by super admins in web-admin. Content is structured data only — never
// HTML or script — and localized per message.
package messages

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Kinds, in display priority order (the client shows at most one at a time).
var kindOrder = map[string]int{"announcement": 0, "survey": 1, "promo": 2}

// Message ids go into URLs, so keep them slug-like.
var idRe = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,63}$`)

// Field types a survey can use.
var fieldTypes = map[string]bool{
	"text": true, "textarea": true, "radio": true, "checkbox": true,
	"select": true, "rating": true, "nps": true,
}

type Message struct {
	ID         string             `json:"id"`
	Kind       string             `json:"kind"`
	Active     bool               `json:"active"`
	Start      *time.Time         `json:"start,omitempty"`
	End        *time.Time         `json:"end,omitempty"`
	Audience   Audience           `json:"audience"`
	RepeatDays int                `json:"repeat_days"` // 0 = show once
	Anonymous  *bool              `json:"anonymous,omitempty"`
	Content    map[string]Content `json:"content"` // locale → content; "en" required
	Fields     []Field            `json:"fields,omitempty"`
}

type Audience struct {
	Roles      []string `json:"roles,omitempty"`     // owner | employee
	Kinds      []string `json:"kinds,omitempty"`     // team | family
	Platforms  []string `json:"platforms,omitempty"` // macos | windows
	Locales    []string `json:"locales,omitempty"`
	MinVersion string   `json:"min_version,omitempty"` // inclusive
	MaxVersion string   `json:"max_version,omitempty"` // inclusive
	Users      []string `json:"users,omitempty"`       // user ids; set = only these users (e.g. testing)
}

type Content struct {
	Title    string `json:"title"`
	Body     string `json:"body"`
	Image    string `json:"image,omitempty"` // https only
	CTALabel string `json:"cta_label,omitempty"`
	CTAURL   string `json:"cta_url,omitempty"` // https only; opened in the browser
}

type Field struct {
	ID       string            `json:"id"`
	Type     string            `json:"type"`
	Required bool              `json:"required"`
	Label    map[string]string `json:"label"`
	Options  []Option          `json:"options,omitempty"`
}

type Option struct {
	Value string            `json:"value"`
	Label map[string]string `json:"label"`
}

// IsAnonymous defaults to true: responses aren't linked to the user unless the
// message opts out explicitly.
func (m *Message) IsAnonymous() bool { return m.Anonymous == nil || *m.Anonymous }

// Viewer is who is asking, as resolved from the token + request.
type Viewer struct {
	UserID   string
	Roles    []string // membership roles across the user's businesses
	Kinds    []string // kinds of those businesses
	Platform string
	Version  string
	Locale   string
}

// Eligible reports whether m should be offered to v at time now.
func Eligible(m *Message, v Viewer, now time.Time) bool {
	if !m.Active {
		return false
	}
	if m.Start != nil && now.Before(*m.Start) {
		return false
	}
	if m.End != nil && !now.Before(*m.End) {
		return false
	}
	a := m.Audience
	if len(a.Users) > 0 && !anyIn([]string{v.UserID}, a.Users) {
		return false
	}
	if len(a.Roles) > 0 && !anyIn(v.Roles, a.Roles) {
		return false
	}
	if len(a.Kinds) > 0 && !anyIn(v.Kinds, a.Kinds) {
		return false
	}
	if len(a.Platforms) > 0 && !anyIn([]string{v.Platform}, a.Platforms) {
		return false
	}
	if len(a.Locales) > 0 && !anyIn([]string{v.Locale}, a.Locales) {
		return false
	}
	if a.MinVersion != "" && compareVersions(v.Version, a.MinVersion) < 0 {
		return false
	}
	if a.MaxVersion != "" && compareVersions(v.Version, a.MaxVersion) > 0 {
		return false
	}
	// Promos go to owners only, and never to anyone in a family workspace
	// (kids), whatever the audience block says.
	if m.Kind == "promo" && (!anyIn(v.Roles, []string{"owner"}) || anyIn(v.Kinds, []string{"family"})) {
		return false
	}
	return true
}

// Resolved is a message flattened to one locale, as sent to the client.
type Resolved struct {
	ID         string          `json:"id"`
	Kind       string          `json:"kind"`
	RepeatDays int             `json:"repeat_days"`
	Title      string          `json:"title"`
	Body       string          `json:"body"`
	Image      string          `json:"image,omitempty"`
	CTALabel   string          `json:"cta_label,omitempty"`
	CTAURL     string          `json:"cta_url,omitempty"`
	Fields     []ResolvedField `json:"fields,omitempty"`
}

type ResolvedField struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"`
	Required bool             `json:"required"`
	Label    string           `json:"label"`
	Options  []ResolvedOption `json:"options,omitempty"`
}

type ResolvedOption struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

// Resolve flattens m to locale, falling back to English.
func Resolve(m *Message, locale string) Resolved {
	c, ok := m.Content[locale]
	if !ok {
		c = m.Content["en"]
	}
	r := Resolved{ID: m.ID, Kind: m.Kind, RepeatDays: m.RepeatDays, Title: c.Title, Body: c.Body,
		Image: c.Image, CTALabel: c.CTALabel, CTAURL: c.CTAURL}
	for _, f := range m.Fields {
		rf := ResolvedField{ID: f.ID, Type: f.Type, Required: f.Required, Label: pick(f.Label, locale)}
		for _, o := range f.Options {
			rf.Options = append(rf.Options, ResolvedOption{Value: o.Value, Label: pick(o.Label, locale)})
		}
		r.Fields = append(r.Fields, rf)
	}
	return r
}

// ValidateAnswers checks a survey response against the message's fields:
// only known fields, required ones present, choice values from the options,
// ratings in range, text capped. Returns the cleaned answers.
func ValidateAnswers(m *Message, answers map[string]any) (map[string]any, error) {
	byID := map[string]Field{}
	for _, f := range m.Fields {
		byID[f.ID] = f
	}
	for id := range answers {
		if _, ok := byID[id]; !ok {
			return nil, fmt.Errorf("unknown field %q", id)
		}
	}
	out := map[string]any{}
	for _, f := range m.Fields {
		v, present := answers[f.ID]
		if !present || v == nil || v == "" {
			if f.Required {
				return nil, fmt.Errorf("field %q is required", f.ID)
			}
			continue
		}
		switch f.Type {
		case "text", "textarea":
			s, ok := v.(string)
			if !ok || len(s) > 2000 {
				return nil, fmt.Errorf("field %q must be text up to 2000 chars", f.ID)
			}
			out[f.ID] = s
		case "radio", "select":
			s, ok := v.(string)
			if !ok || !hasOption(f, s) {
				return nil, fmt.Errorf("field %q has an invalid choice", f.ID)
			}
			out[f.ID] = s
		case "checkbox":
			list, ok := v.([]any)
			if !ok || (f.Required && len(list) == 0) {
				return nil, fmt.Errorf("field %q must be a list of choices", f.ID)
			}
			var vals []string
			for _, x := range list {
				s, ok := x.(string)
				if !ok || !hasOption(f, s) {
					return nil, fmt.Errorf("field %q has an invalid choice", f.ID)
				}
				vals = append(vals, s)
			}
			out[f.ID] = vals
		case "rating", "nps":
			n, ok := v.(float64)
			lo, hi := 1.0, 5.0
			if f.Type == "nps" {
				lo, hi = 0, 10
			}
			if !ok || n != float64(int(n)) || n < lo || n > hi {
				return nil, fmt.Errorf("field %q must be a whole number from %v to %v", f.ID, lo, hi)
			}
			out[f.ID] = int(n)
		}
	}
	return out, nil
}

// Validate checks a message before it is saved, so a typo fails loudly instead of
// showing a broken popup.
func Validate(m *Message) error {
	if !idRe.MatchString(m.ID) || strings.HasPrefix(m.ID, "whatsnew-") {
		return fmt.Errorf("id %q must be a-z 0-9 . _ - (and not start with whatsnew-)", m.ID)
	}
	if _, ok := kindOrder[m.Kind]; !ok {
		return fmt.Errorf("kind must be announcement, survey or promo")
	}
	if m.Start != nil && m.End != nil && !m.End.After(*m.Start) {
		return fmt.Errorf("end must be after start")
	}
	if m.RepeatDays < 0 {
		return fmt.Errorf("repeat_days can't be negative")
	}
	en, ok := m.Content["en"]
	if !ok || en.Title == "" {
		return fmt.Errorf("an English title is required")
	}
	for loc, c := range m.Content {
		for _, u := range []string{c.Image, c.CTAURL} {
			if u != "" && !strings.HasPrefix(u, "https://") {
				return fmt.Errorf("%s: image and link must start with https://", loc)
			}
		}
		if (c.CTAURL == "") != (c.CTALabel == "") {
			return fmt.Errorf("%s: a button needs both a label and a link", loc)
		}
	}
	if m.Kind == "survey" && len(m.Fields) == 0 {
		return fmt.Errorf("a survey needs at least one question")
	}
	if m.Kind != "survey" && len(m.Fields) > 0 {
		return fmt.Errorf("only surveys have questions")
	}
	fieldIDs := map[string]bool{}
	for _, f := range m.Fields {
		if f.ID == "" || fieldIDs[f.ID] || !fieldTypes[f.Type] || f.Label["en"] == "" {
			return fmt.Errorf("question %q needs a unique id, a known type and an English label", f.ID)
		}
		fieldIDs[f.ID] = true
		needsOptions := f.Type == "radio" || f.Type == "select" || f.Type == "checkbox"
		if needsOptions != (len(f.Options) > 0) {
			return fmt.Errorf("question %q: choice questions need options, others must not have them", f.ID)
		}
		values := map[string]bool{}
		for _, o := range f.Options {
			if o.Value == "" || values[o.Value] || o.Label["en"] == "" {
				return fmt.Errorf("question %q: each option needs a unique value and an English label", f.ID)
			}
			values[o.Value] = true
		}
	}
	return nil
}

// SameStructure reports whether two question lists would store answers the same
// way: same question ids, types and option values, in any order. Wording,
// translations, required flags and question order may differ. Once a survey has
// answers, only such edits are allowed, so existing answers keep their meaning.
func SameStructure(a, b []Field) bool {
	sig := func(fs []Field) map[string]string {
		out := map[string]string{}
		for _, f := range fs {
			vals := make([]string, 0, len(f.Options))
			for _, o := range f.Options {
				vals = append(vals, o.Value)
			}
			sort.Strings(vals)
			out[f.ID] = f.Type + ":" + strings.Join(vals, "\x00")
		}
		return out
	}
	sa, sb := sig(a), sig(b)
	if len(sa) != len(sb) {
		return false
	}
	for id, v := range sa {
		if sb[id] != v {
			return false
		}
	}
	return true
}

// DisplayRank orders messages for the client: announcement, survey, promo.
func DisplayRank(kind string) int { return kindOrder[kind] }

func pick(labels map[string]string, locale string) string {
	if s, ok := labels[locale]; ok && s != "" {
		return s
	}
	return labels["en"]
}

func hasOption(f Field, v string) bool {
	for _, o := range f.Options {
		if o.Value == v {
			return true
		}
	}
	return false
}

func anyIn(have, want []string) bool {
	for _, h := range have {
		for _, w := range want {
			if h == w {
				return true
			}
		}
	}
	return false
}

// compareVersions compares dotted numeric versions ("1.5.10" > "1.5.9").
// Missing or non-numeric parts count as 0.
func compareVersions(a, b string) int {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			if x < y {
				return -1
			}
			return 1
		}
	}
	return 0
}
