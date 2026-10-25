package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"
	"sort"
	"time"

	"ctracking/backend/internal/auth"
	"ctracking/backend/internal/messages"
	"ctracking/backend/internal/obs"
	"ctracking/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// MessagesHandler serves in-app messages to the desktop app, records survey
// answers and popup analytics (ticket 145).
type MessagesHandler struct {
	store  *store.Store
	secret []byte // keys the per-message actor pseudonym
}

func NewMessagesHandler(s *store.Store, secret string) *MessagesHandler {
	return &MessagesHandler{store: s, secret: []byte(secret)}
}

// actor is a stable per-(user, message) pseudonym: unique users can be counted,
// but not identified or linked across messages.
func (h *MessagesHandler) actor(userID, messageID string) string {
	mac := hmac.New(sha256.New, h.secret)
	mac.Write([]byte(userID + "|" + messageID))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}

// randomActor is a one-off id for events that must not be linkable to anyone.
func randomActor() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// primaryRole collapses a user's membership roles to one label for analytics.
func primaryRole(roles []string) string {
	for _, r := range roles {
		if r == "owner" {
			return "owner"
		}
	}
	if len(roles) > 0 {
		return roles[0]
	}
	return ""
}

// List returns the messages the caller is eligible for, flattened to their locale
// and in display priority order, and records them as delivered.
// Query: platform, version, locale.
func (h *MessagesHandler) List(c *gin.Context) {
	ctx := c.Request.Context()
	userID, _ := auth.UserID(c)
	list, err := h.store.ActiveMessages(ctx)
	if err != nil {
		serverError(c, err)
		return
	}
	roles, kinds, err := h.store.MessageAudience(ctx, userID)
	if err != nil {
		serverError(c, err)
		return
	}
	answered, err := h.store.AnsweredMessageIDs(ctx, userID)
	if err != nil {
		serverError(c, err)
		return
	}
	v := messages.Viewer{UserID: userID, Roles: roles, Kinds: kinds, Platform: c.Query("platform"),
		Version: c.Query("version"), Locale: c.Query("locale")}
	sort.SliceStable(list, func(i, j int) bool {
		return messages.DisplayRank(list[i].Kind) < messages.DisplayRank(list[j].Kind)
	})
	now := time.Now()
	out := []messages.Resolved{}
	for i := range list {
		m := &list[i]
		if answered[m.ID] || !messages.Eligible(m, v, now) {
			continue
		}
		out = append(out, messages.Resolve(m, v.Locale))
		if err := h.store.RecordMessageEvent(ctx, store.MessageEvent{MessageID: m.ID, Event: "delivered",
			Actor: h.actor(userID, m.ID), Role: primaryRole(roles), Platform: v.Platform,
			Locale: v.Locale, AppVersion: v.Version}); err != nil {
			obs.Warn("message delivered event failed", "message", m.ID, "err", err)
		}
	}
	c.JSON(http.StatusOK, gin.H{"messages": out})
}

type respondReq struct {
	Answers  map[string]any `json:"answers"`
	Version  string         `json:"version"`
	Platform string         `json:"platform"`
	Locale   string         `json:"locale"`
}

// Respond stores a survey answer for message :id.
func (h *MessagesHandler) Respond(c *gin.Context) {
	userID, _ := auth.UserID(c)
	var req respondReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	m, err := h.store.GetMessage(c.Request.Context(), c.Param("id"))
	if errors.Is(err, store.ErrNotFound) || (err == nil && m.Kind != "survey") {
		c.JSON(http.StatusNotFound, gin.H{"error": "no such survey"})
		return
	}
	if err != nil {
		serverError(c, err)
		return
	}
	// Same eligibility as the list: active, in its dates, aimed at this user.
	roles, kinds, err := h.store.MessageAudience(c.Request.Context(), userID)
	if err != nil {
		serverError(c, err)
		return
	}
	v := messages.Viewer{UserID: userID, Roles: roles, Kinds: kinds, Platform: req.Platform, Version: req.Version, Locale: req.Locale}
	if !messages.Eligible(&m.Message, v, time.Now()) {
		c.JSON(http.StatusNotFound, gin.H{"error": "no such survey"})
		return
	}
	answers, err := messages.ValidateAnswers(&m.Message, req.Answers)
	if err != nil {
		badRequest(c, err.Error())
		return
	}
	var who *string
	if !m.IsAnonymous() {
		who = &userID
	}
	if err := h.store.SaveMessageResponse(c.Request.Context(), m.ID, who, answers,
		req.Version, req.Platform, req.Locale); err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Client-reported popup events ('delivered' is recorded server-side by List).
var clientEvents = map[string]bool{"shown": true, "dismissed": true, "later": true, "cta": true, "submitted": true}

// The bundled "What's new" popup reports under whatsnew-<version>.
var whatsNewID = regexp.MustCompile(`^whatsnew-[0-9][0-9A-Za-z.+-]{0,31}$`)

type eventReq struct {
	Event    string `json:"event"`
	Version  string `json:"version"`
	Platform string `json:"platform"`
	Locale   string `json:"locale"`
}

// Event records a popup analytics event for message :id.
func (h *MessagesHandler) Event(c *gin.Context) {
	ctx := c.Request.Context()
	userID, _ := auth.UserID(c)
	var req eventReq
	if err := c.ShouldBindJSON(&req); err != nil || !clientEvents[req.Event] {
		badRequest(c, "event must be shown, dismissed, later, cta or submitted")
		return
	}
	id := c.Param("id")
	actor := h.actor(userID, id)
	if !whatsNewID.MatchString(id) {
		m, err := h.store.GetMessage(ctx, id)
		if errors.Is(err, store.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "no such message"})
			return
		} else if err != nil {
			serverError(c, err)
			return
		}
		// An anonymous survey's submission must not carry the user's pseudonym,
		// or it could be tied to their other events (and, by time, their answer).
		if req.Event == "submitted" && m.Kind == "survey" && m.IsAnonymous() {
			actor = randomActor()
		}
	}
	roles, _, err := h.store.MessageAudience(ctx, userID)
	if err != nil {
		serverError(c, err)
		return
	}
	if err := h.store.RecordMessageEvent(ctx, store.MessageEvent{MessageID: id, Event: req.Event,
		Actor: actor, Role: primaryRole(roles), Platform: req.Platform,
		Locale: req.Locale, AppVersion: req.Version}); err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
