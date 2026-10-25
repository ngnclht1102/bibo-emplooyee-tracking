package handlers

import (
	"net/http"
	"strconv"
	"time"

	"ctracking/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// AdminOverviewHandler serves the super-admin Business overview (ticket 149).
type AdminOverviewHandler struct {
	store *store.Store
}

func NewAdminOverviewHandler(s *store.Store) *AdminOverviewHandler {
	return &AdminOverviewHandler{store: s}
}

// Get returns growth, activity, retention and churn for the last `days` (30, 90 or
// 180) complete UTC days. Aggregates only — no titles, URLs or screenshots.
func (h *AdminOverviewHandler) Get(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "90"))
	if days != 30 && days != 90 && days != 180 {
		badRequest(c, "days must be 30, 90 or 180")
		return
	}
	ov, err := h.store.GetOverview(c.Request.Context(), days, time.Now())
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, ov)
}
