package handlers

import (
	"errors"
	"math"
	"net/http"
	"strings"

	"ctracking/backend/internal/auth"
	"ctracking/backend/internal/messages"
	"ctracking/backend/internal/obs"
	"ctracking/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// isSuperAdmin reports whether u is listed in SUPER_ADMINS (by username or email).
func isSuperAdmin(u store.User, admins []string) bool {
	for _, a := range admins {
		if a != "" && (strings.EqualFold(a, u.Username) || strings.EqualFold(a, u.Email)) {
			return true
		}
	}
	return false
}

// SuperAdmin allows the request only for users listed in SUPER_ADMINS. Must run
// after the token middleware.
func SuperAdmin(st *store.Store, admins []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := auth.UserID(c)
		u, err := st.GetUserByID(c.Request.Context(), userID)
		if err != nil || !isSuperAdmin(u, admins) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "super admin only"})
			return
		}
		c.Next()
	}
}

// AdminMessagesHandler lets super admins manage in-app messages and read their
// analytics (ticket 145).
type AdminMessagesHandler struct {
	store *store.Store
}

func NewAdminMessagesHandler(s *store.Store) *AdminMessagesHandler {
	return &AdminMessagesHandler{store: s}
}

type adminMessageRow struct {
	store.AdminMessage
	Stats map[string]store.EventCount `json:"stats"`
}

type whatsNewRow struct {
	ID    string                      `json:"id"`
	Stats map[string]store.EventCount `json:"stats"`
}

// List returns every message with its event totals, plus the bundled
// "What's new" popups that have reported events.
func (h *AdminMessagesHandler) List(c *gin.Context) {
	ctx := c.Request.Context()
	list, err := h.store.ListMessages(ctx)
	if err != nil {
		serverError(c, err)
		return
	}
	totals, err := h.store.MessageEventTotals(ctx)
	if err != nil {
		serverError(c, err)
		return
	}
	rows := []adminMessageRow{}
	for _, m := range list {
		rows = append(rows, adminMessageRow{AdminMessage: m, Stats: orEmpty(totals[m.ID])})
	}
	whatsNew := []whatsNewRow{}
	for id, st := range totals {
		if strings.HasPrefix(id, "whatsnew-") {
			whatsNew = append(whatsNew, whatsNewRow{ID: id, Stats: st})
		}
	}
	c.JSON(http.StatusOK, gin.H{"messages": rows, "whatsnew": whatsNew})
}

func orEmpty(m map[string]store.EventCount) map[string]store.EventCount {
	if m == nil {
		return map[string]store.EventCount{}
	}
	return m
}

// Get returns one message for editing.
func (h *AdminMessagesHandler) Get(c *gin.Context) {
	m, err := h.store.GetMessage(c.Request.Context(), c.Param("id"))
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "no such message"})
		return
	}
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, m)
}

func (h *AdminMessagesHandler) bind(c *gin.Context) (*messages.Message, bool) {
	var m messages.Message
	if err := c.ShouldBindJSON(&m); err != nil {
		badRequest(c, "invalid body")
		return nil, false
	}
	if err := messages.Validate(&m); err != nil {
		badRequest(c, err.Error())
		return nil, false
	}
	return &m, true
}

// Create adds a message.
func (h *AdminMessagesHandler) Create(c *gin.Context) {
	m, ok := h.bind(c)
	if !ok {
		return
	}
	err := h.store.CreateMessage(c.Request.Context(), m)
	if errors.Is(err, store.ErrConflict) {
		c.JSON(http.StatusConflict, gin.H{"error": "a message with that id already exists"})
		return
	}
	if err != nil {
		serverError(c, err)
		return
	}
	obs.Info("message created", "message", m.ID, "active", m.Active)
	c.JSON(http.StatusCreated, gin.H{"id": m.ID})
}

// Update replaces message :id (the id itself can't change).
func (h *AdminMessagesHandler) Update(c *gin.Context) {
	m, ok := h.bind(c)
	if !ok {
		return
	}
	if m.ID != c.Param("id") {
		badRequest(c, "the id can't be changed")
		return
	}
	// Once a survey has answers, its questions can be reworded/translated but
	// not restructured — existing answers must keep their meaning.
	old, err := h.store.GetMessage(c.Request.Context(), m.ID)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "no such message"})
		return
	}
	if err != nil {
		serverError(c, err)
		return
	}
	if old.ResponseCount > 0 && (m.Kind != old.Kind || !messages.SameStructure(old.Fields, m.Fields)) {
		c.JSON(http.StatusConflict, gin.H{"error": "this survey already has answers: you can reword or translate it, " +
			"but not change its type, question ids, question types or option values — create a new survey instead"})
		return
	}
	err = h.store.UpdateMessage(c.Request.Context(), m)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "no such message"})
		return
	}
	if err != nil {
		serverError(c, err)
		return
	}
	obs.Info("message updated", "message", m.ID, "active", m.Active)
	c.JSON(http.StatusOK, gin.H{"id": m.ID})
}

// Delete removes message :id and its survey answers.
func (h *AdminMessagesHandler) Delete(c *gin.Context) {
	err := h.store.DeleteMessage(c.Request.Context(), c.Param("id"))
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "no such message"})
		return
	}
	if err != nil {
		serverError(c, err)
		return
	}
	obs.Info("message deleted", "message", c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Stats returns analytics for :id (a message or whatsnew-<version>): totals,
// the last 60 days, breakdowns, and for surveys a per-question summary plus the
// raw answers (for CSV export in the browser).
func (h *AdminMessagesHandler) Stats(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")
	totals, err := h.store.MessageEventTotals(ctx)
	if err != nil {
		serverError(c, err)
		return
	}
	daily, err := h.store.MessageDaily(ctx, id, 60)
	if err != nil {
		serverError(c, err)
		return
	}
	breakdown, err := h.store.MessageBreakdown(ctx, id)
	if err != nil {
		serverError(c, err)
		return
	}
	out := gin.H{"id": id, "totals": orEmpty(totals[id]), "daily": daily, "breakdown": breakdown}

	m, err := h.store.GetMessage(ctx, id)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		serverError(c, err)
		return
	}
	if err == nil {
		out["message"] = m
		if m.Kind == "survey" {
			responses, err := h.store.MessageResponses(ctx, id)
			if err != nil {
				serverError(c, err)
				return
			}
			out["responses"] = responses
			out["summary"] = summarize(m.Fields, responses)
		}
	}
	c.JSON(http.StatusOK, out)
}

// FieldSummary aggregates the answers to one survey question.
type FieldSummary struct {
	ID       string        `json:"id"`
	Type     string        `json:"type"`
	Label    string        `json:"label"`
	Answered int           `json:"answered"`
	Options  []OptionCount `json:"options,omitempty"` // radio / select / checkbox
	Scale    map[int]int   `json:"scale,omitempty"`   // rating / nps: value → count
	Average  *float64      `json:"average,omitempty"` // rating / nps
	NPS      *int          `json:"nps,omitempty"`     // % promoters (9–10) − % detractors (0–6)
	Texts    []string      `json:"texts,omitempty"`   // text / textarea, newest first
}

type OptionCount struct {
	Value string `json:"value"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

func summarize(fields []messages.Field, responses []store.MessageResponse) []FieldSummary {
	out := []FieldSummary{}
	for _, f := range fields {
		s := FieldSummary{ID: f.ID, Type: f.Type, Label: f.Label["en"]}
		counts := map[string]int{}
		var sum, promoters, detractors int
		for _, r := range responses {
			v, ok := r.Answers[f.ID]
			if !ok {
				continue
			}
			s.Answered++
			switch f.Type {
			case "radio", "select":
				if x, ok := v.(string); ok {
					counts[x]++
				}
			case "checkbox":
				if list, ok := v.([]any); ok {
					for _, x := range list {
						if xs, ok := x.(string); ok {
							counts[xs]++
						}
					}
				}
			case "rating", "nps":
				if n, ok := v.(float64); ok {
					if s.Scale == nil {
						s.Scale = map[int]int{}
					}
					s.Scale[int(n)]++
					sum += int(n)
					if n >= 9 {
						promoters++
					} else if n <= 6 {
						detractors++
					}
				}
			case "text", "textarea":
				if x, ok := v.(string); ok && x != "" && len(s.Texts) < 200 {
					s.Texts = append(s.Texts, x)
				}
			}
		}
		for _, o := range f.Options {
			s.Options = append(s.Options, OptionCount{Value: o.Value, Label: o.Label["en"], Count: counts[o.Value]})
		}
		if (f.Type == "rating" || f.Type == "nps") && s.Answered > 0 {
			avg := float64(sum) / float64(s.Answered)
			s.Average = &avg
			if f.Type == "nps" {
				nps := int(math.Round(float64((promoters-detractors)*100) / float64(s.Answered)))
				s.NPS = &nps
			}
		}
		out = append(out, s)
	}
	return out
}

// Users finds users for the message audience picker: ?q= searches name, username
// and email; ?ids=a,b looks up already-picked users.
func (h *AdminMessagesHandler) Users(c *gin.Context) {
	var ids []string
	if s := c.Query("ids"); s != "" {
		ids = strings.Split(s, ",")
	}
	q := strings.TrimSpace(c.Query("q"))
	if len(ids) == 0 && len(q) < 2 {
		c.JSON(http.StatusOK, gin.H{"users": []store.AdminUser{}})
		return
	}
	users, err := h.store.FindUsers(c.Request.Context(), q, ids)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"users": users})
}
