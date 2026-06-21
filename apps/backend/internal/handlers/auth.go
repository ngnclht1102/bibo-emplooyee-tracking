package handlers

import (
	"errors"
	"net/http"
	"strings"

	"ctracking/backend/internal/auth"
	"ctracking/backend/internal/obs"
	"ctracking/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// AuthHandler serves registration, login, refresh, and the public picker.
type AuthHandler struct {
	store *store.Store
	tok   *auth.Manager
}

// NewAuthHandler wires the auth handler.
func NewAuthHandler(s *store.Store, tok *auth.Manager) *AuthHandler {
	return &AuthHandler{store: s, tok: tok}
}

type registerReq struct {
	Email       string `json:"email"`    // optional if username is set
	Username    string `json:"username"` // optional if email is set
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
	AccountType string `json:"account_type"` // 'manager' (default) | 'parent'
}

// Register creates a new account (any user can be an owner) and returns tokens.
func (h *AuthHandler) Register(c *gin.Context) {
	var req registerReq
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
	if req.AccountType == "" {
		req.AccountType = "manager"
	}
	if req.AccountType != "manager" && req.AccountType != "parent" {
		badRequest(c, "account_type must be 'manager' or 'parent'")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		serverError(c, err)
		return
	}
	u, err := h.store.CreateUser(c.Request.Context(), req.Email, req.Username, hash, req.DisplayName, req.AccountType)
	if errors.Is(err, store.ErrConflict) {
		c.JSON(http.StatusConflict, gin.H{"error": "that email or username is already taken"})
		return
	}
	if err != nil {
		serverError(c, err)
		return
	}
	h.issue(c, http.StatusCreated, u)
}

type loginReq struct {
	Identifier string `json:"identifier"` // email or username
	Email      string `json:"email"`      // legacy field; treated as an identifier
	Password   string `json:"password"`
	BusinessID string `json:"business_id"` // optional: employee picking their company
}

// Login verifies credentials and returns tokens. If business_id is supplied, the
// user must be a member of that business.
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}

	identifier := req.Identifier
	if identifier == "" {
		identifier = req.Email
	}
	u, hash, err := h.store.GetUserByIdentifier(c.Request.Context(), identifier)
	if err != nil {
		// Same response for unknown user and bad password — don't leak which.
		unauthorized(c, "invalid credentials")
		return
	}
	ok, err := auth.VerifyPassword(hash, req.Password)
	if err != nil || !ok {
		unauthorized(c, "invalid credentials")
		return
	}

	if req.BusinessID != "" {
		member, err := h.store.IsMember(c.Request.Context(), u.ID, req.BusinessID)
		if err != nil {
			serverError(c, err)
			return
		}
		if !member {
			c.JSON(http.StatusForbidden, gin.H{"error": "not a member of that business"})
			return
		}
	}
	h.issue(c, http.StatusOK, u)
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

// Refresh exchanges a valid refresh token for a new token pair.
func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	userID, err := h.tok.ParseRefresh(req.RefreshToken)
	if err != nil {
		unauthorized(c, "invalid refresh token")
		return
	}
	pair, err := h.tok.Issue(userID)
	if err != nil {
		serverError(c, err)
		return
	}
	obs.Info("login ok", "user", userID)
	c.JSON(http.StatusOK, pair)
}

// PublicBusinesses lists businesses + owner names for the login picker (no auth).
func (h *AuthHandler) PublicBusinesses(c *gin.Context) {
	list, err := h.store.ListPublicBusinesses(c.Request.Context())
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"businesses": list})
}

// Me returns the authenticated user (protected route).
func (h *AuthHandler) Me(c *gin.Context) {
	userID, ok := auth.UserID(c)
	if !ok {
		unauthorized(c, "unauthenticated")
		return
	}
	u, err := h.store.GetUserByID(c.Request.Context(), userID)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":           u.ID,
		"email":        u.Email,
		"username":     u.Username,
		"display_name": u.DisplayName,
		"account_type": u.AccountType,
	})
}

func (h *AuthHandler) issue(c *gin.Context, status int, u store.User) {
	pair, err := h.tok.Issue(u.ID)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(status, gin.H{
		"user": gin.H{
			"id":           u.ID,
			"email":        u.Email,
			"username":     u.Username,
			"display_name": u.DisplayName,
			"account_type": u.AccountType,
		},
		"tokens": pair,
	})
}
