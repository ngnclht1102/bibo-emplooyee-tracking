package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"ctracking/backend/internal/auth"
	"ctracking/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// OwnerHandler serves business + employee management for owners.
type OwnerHandler struct {
	store *store.Store
}

// NewOwnerHandler wires the owner handler.
func NewOwnerHandler(s *store.Store) *OwnerHandler {
	return &OwnerHandler{store: s}
}

type createBusinessReq struct {
	Name string `json:"name"`
}

// CreateBusiness creates a business owned by the caller.
func (h *OwnerHandler) CreateBusiness(c *gin.Context) {
	userID, _ := auth.UserID(c)
	var req createBusinessReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		badRequest(c, "name is required")
		return
	}
	// kind mirrors the owner's persona: a parent gets a 'family' business.
	kind := "team"
	if u, err := h.store.GetUserByID(c.Request.Context(), userID); err == nil && u.AccountType == "parent" {
		kind = "family"
	}
	biz, err := h.store.CreateBusiness(c.Request.Context(), userID, req.Name, kind)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusCreated, biz)
}

// ListMine returns the businesses the caller owns.
func (h *OwnerHandler) ListMine(c *gin.Context) {
	userID, _ := auth.UserID(c)
	list, err := h.store.ListBusinessesOwnedBy(c.Request.Context(), userID)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"businesses": list})
}

type createEmployeeReq struct {
	Email       string  `json:"email"`    // optional if username is set
	Username    string  `json:"username"` // optional if email is set
	Password    string  `json:"password"`
	DisplayName string  `json:"display_name"`
	BusinessID  *string `json:"business_id"` // optional: omit to use/auto-create the owner's business
}

// usernameRe constrains member usernames: lowercase letters, digits, underscores.
var usernameRe = regexp.MustCompile(`^[a-z0-9_]{3,32}$`)

// CreateEmployee creates a pre-provisioned employee account. With no business_id the
// owner's first business is used, auto-creating one if the owner has none.
func (h *OwnerHandler) CreateEmployee(c *gin.Context) {
	userID, _ := auth.UserID(c)
	var req createEmployeeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	req.Email = strings.TrimSpace(req.Email)
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.DisplayName == "" {
		badRequest(c, "display_name is required")
		return
	}
	if req.Email == "" && req.Username == "" {
		badRequest(c, "an email or username is required")
		return
	}
	if req.Username != "" && !usernameRe.MatchString(req.Username) {
		badRequest(c, "username must be 3-32 chars: lowercase letters, digits, underscores")
		return
	}
	if len(req.Password) < 8 {
		badRequest(c, "password must be at least 8 characters")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		serverError(c, err)
		return
	}
	emp, biz, err := h.store.CreateEmployee(c.Request.Context(), userID, req.BusinessID, req.Email, req.Username, hash, req.DisplayName)
	switch {
	case errors.Is(err, store.ErrConflict):
		c.JSON(http.StatusConflict, gin.H{"error": "that email or username is already taken"})
		return
	case errors.Is(err, store.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "business not found"})
		return
	case errors.Is(err, store.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "not your business"})
		return
	case err != nil:
		serverError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"employee": emp, "business": biz})
}

// ListEmployees returns the roster of a business the caller owns.
func (h *OwnerHandler) ListEmployees(c *gin.Context) {
	if !h.requireOwner(c) {
		return
	}
	list, err := h.store.ListEmployees(c.Request.Context(), c.Param("id"))
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"employees": list})
}

// UpdateSettings updates a business's capture policy. Only the keys present in the
// body are changed; screenshot_retention_days accepts null ("keep forever").
func (h *OwnerHandler) UpdateSettings(c *gin.Context) {
	if !h.requireOwner(c) {
		return
	}
	var body map[string]json.RawMessage
	if err := c.ShouldBindJSON(&body); err != nil {
		badRequest(c, "invalid body")
		return
	}

	fields := map[string]any{}

	// Retention is nullable: present-as-null means "keep forever".
	if raw, ok := body["screenshot_retention_days"]; ok {
		if string(raw) == "null" {
			fields["screenshot_retention_days"] = nil
		} else {
			var n int
			if json.Unmarshal(raw, &n) != nil || n < 0 {
				badRequest(c, "screenshot_retention_days must be a non-negative integer or null")
				return
			}
			fields["screenshot_retention_days"] = n
		}
	}
	for _, key := range []string{"screenshot_interval_s", "idle_threshold_s"} {
		if raw, ok := body[key]; ok {
			var n int
			if json.Unmarshal(raw, &n) != nil || n <= 0 {
				badRequest(c, key+" must be a positive integer")
				return
			}
			fields[key] = n
		}
	}
	if raw, ok := body["allow_employee_override"]; ok {
		var b bool
		if json.Unmarshal(raw, &b) != nil {
			badRequest(c, "allow_employee_override must be a boolean")
			return
		}
		fields["allow_employee_override"] = b
	}

	if err := h.store.UpdateBusinessSettings(c.Request.Context(), c.Param("id"), fields); err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// Policy returns the capture policy for the authenticated user's business, or
// {managed:false} when the user has no single business (standalone → local defaults).
func (h *OwnerHandler) Policy(c *gin.Context) {
	userID, _ := auth.UserID(c)
	p, err := h.store.PolicyForUser(c.Request.Context(), userID)
	if errors.Is(err, store.ErrAmbiguousBusiness) {
		c.JSON(http.StatusOK, gin.H{"managed": false})
		return
	}
	if err != nil {
		serverError(c, err)
		return
	}
	if p == nil {
		c.JSON(http.StatusOK, gin.H{"managed": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"managed":                   true,
		"screenshot_interval_s":     p.ScreenshotIntervalS,
		"idle_threshold_s":          p.IdleThresholdS,
		"screenshot_retention_days": p.ScreenshotRetentionDays,
		"allow_employee_override":   p.AllowEmployeeOverride,
		"kind":                      p.Kind,
	})
}

// requireOwner verifies the authenticated caller owns the :id business. It writes
// the appropriate error response and returns false when not allowed.
func (h *OwnerHandler) requireOwner(c *gin.Context) bool {
	userID, _ := auth.UserID(c)
	biz, err := h.store.GetBusiness(c.Request.Context(), c.Param("id"))
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "business not found"})
		return false
	}
	if err != nil {
		serverError(c, err)
		return false
	}
	if biz.OwnerUserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your business"})
		return false
	}
	return true
}
