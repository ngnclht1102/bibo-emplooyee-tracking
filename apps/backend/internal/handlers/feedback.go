package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"ctracking/backend/internal/auth"
	"ctracking/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// FeedbackHandler takes "Send feedback" submissions from the desktop app and
// lists them for super admins (ticket 160).
type FeedbackHandler struct {
	store *store.Store
}

func NewFeedbackHandler(s *store.Store) *FeedbackHandler {
	return &FeedbackHandler{store: s}
}

const (
	maxFeedbackMessage = 4000
	maxFeedbackEmail   = 200
)

var feedbackKinds = map[string]bool{"bug": true, "idea": true, "question": true, "other": true}

type feedbackReq struct {
	Kind     string `json:"kind"`
	Message  string `json:"message"`
	Email    string `json:"email"`
	Version  string `json:"version"`
	Platform string `json:"platform"`
	Locale   string `json:"locale"`
}

// trunc keeps a client-supplied string to n characters so a stray payload can't
// bloat a row (the desktop already caps these in the form).
func trunc(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

// Submit stores one feedback message. The route is public (auth.Optional): a
// personal-mode app has no account, and its users still need a way to write in.
// When the caller is signed in the row is linked to their user.
func (h *FeedbackHandler) Submit(c *gin.Context) {
	var req feedbackReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	if !feedbackKinds[req.Kind] {
		badRequest(c, "kind must be bug, idea, question or other")
		return
	}
	msg := trunc(req.Message, maxFeedbackMessage)
	if msg == "" {
		badRequest(c, "message is required")
		return
	}
	f := store.Feedback{
		Email:      trunc(req.Email, maxFeedbackEmail),
		Kind:       req.Kind,
		Message:    msg,
		AppVersion: trunc(req.Version, 32),
		Platform:   trunc(req.Platform, 32),
		Locale:     trunc(req.Locale, 16),
	}
	if userID, ok := auth.UserID(c); ok && userID != "" {
		f.UserID = &userID
	}
	if err := h.store.SaveFeedback(c.Request.Context(), f); err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// List returns feedback newest first for the super-admin area.
// Query: limit (default 50, max 200), offset.
func (h *FeedbackHandler) List(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset, _ := strconv.Atoi(c.Query("offset"))
	if offset < 0 {
		offset = 0
	}
	rows, total, err := h.store.ListFeedback(c.Request.Context(), limit, offset)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"feedback": rows, "total": total})
}

const maxFeedbackReply = 4000

// Reply writes the super-admin answer to one submission (ticket 165). Rewriting
// it is allowed and re-notifies the sender; an empty reply withdraws it.
func (h *FeedbackHandler) Reply(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		badRequest(c, "invalid id")
		return
	}
	var req struct {
		Reply string `json:"reply"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	adminID, _ := auth.UserID(c)
	ok, err := h.store.SetFeedbackReply(c.Request.Context(), id, trunc(req.Reply, maxFeedbackReply), adminID)
	if err != nil {
		serverError(c, err)
		return
	}
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "feedback not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Mine returns the caller's own submissions with any super-admin reply, plus how
// many replies they haven't read yet — the desktop's "Your feedback" list and the
// unread badge come from this one call.
func (h *FeedbackHandler) Mine(c *gin.Context) {
	userID, _ := auth.UserID(c)
	rows, unread, err := h.store.ListMyFeedback(c.Request.Context(), userID, 50)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"feedback": rows, "unread": unread})
}

// MarkMineSeen clears the caller's unread replies, called when they open the page
// the replies are shown on.
func (h *FeedbackHandler) MarkMineSeen(c *gin.Context) {
	userID, _ := auth.UserID(c)
	if err := h.store.MarkRepliesSeen(c.Request.Context(), userID); err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
