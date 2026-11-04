package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ctracking/backend/internal/auth"
	"ctracking/backend/internal/billing"
	"ctracking/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// BillingHandler serves billing (tickets 152, 159). Owners manage projects, rates
// and the time log from web-admin under /businesses/:id/billing, and receive the
// invoices their members raise; every member creates tasks, logs their own time and
// invoices the workspace from the desktop under /work. Family workspaces have no
// billing.
type BillingHandler struct {
	store *store.Store
}

func NewBillingHandler(s *store.Store) *BillingHandler {
	return &BillingHandler{store: s}
}

const (
	ctxBiz  = "billing.biz"
	ctxRole = "billing.role"
	ctxWork = "billing.work"
)

// OwnerOnly gates /businesses/:id/billing: the caller must own the team workspace.
func (h *BillingHandler) OwnerOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		h.gate(c, c.Param("id"), true)
	}
}

// Member gates /work: the caller's workspace (?business_id, or their only one).
func (h *BillingHandler) Member() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := auth.UserID(c)
		var explicit *string
		if b := c.Query("business_id"); b != "" {
			explicit = &b
		}
		c.Set(ctxWork, true)
		bizID, err := h.store.ResolveBusinessForUser(c.Request.Context(), userID, explicit)
		switch {
		case errors.Is(err, store.ErrNotFound), errors.Is(err, store.ErrForbidden):
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "no workspace"})
			return
		case errors.Is(err, store.ErrAmbiguousBusiness):
			c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": "business_id is required"})
			return
		case err != nil:
			serverError(c, err)
			c.Abort()
			return
		}
		h.gate(c, bizID, false)
	}
}

func (h *BillingHandler) gate(c *gin.Context, bizID string, ownerOnly bool) {
	ctx := c.Request.Context()
	userID, _ := auth.UserID(c)
	biz, err := h.store.GetBusiness(ctx, bizID)
	if errors.Is(err, store.ErrNotFound) {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "business not found"})
		return
	}
	if err != nil {
		serverError(c, err)
		c.Abort()
		return
	}
	role, err := h.store.MemberRole(ctx, userID, bizID)
	if err != nil {
		serverError(c, err)
		c.Abort()
		return
	}
	if biz.OwnerUserID == userID {
		role = "owner"
	}
	if role == "" || (ownerOnly && role != "owner") {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "not your business"})
		return
	}
	if biz.Kind == "family" {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "billing is only for team workspaces"})
		return
	}
	c.Set(ctxBiz, bizID)
	c.Set(ctxRole, role)
	c.Next()
}

func bizOf(c *gin.Context) string  { return c.GetString(ctxBiz) }
func isOwner(c *gin.Context) bool  { return c.GetString(ctxRole) == "owner" }

// isWork reports whether the call came in on the desktop's /v1/work routes.
func isWork(c *gin.Context) bool { return c.GetBool(ctxWork) }
func userOf(c *gin.Context) string { id, _ := auth.UserID(c); return id }

// storeError maps store errors to responses; returns true when it wrote one.
func storeError(c *gin.Context, err error, what string) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, store.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": what + " not found"})
	case errors.Is(err, store.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this workspace"})
	case errors.Is(err, store.ErrLocked):
		c.JSON(http.StatusConflict, gin.H{"error": "this time is on an invoice and can't be changed"})
	case errors.Is(err, store.ErrInUse):
		c.JSON(http.StatusConflict, gin.H{"error": what + " is still in use — archive it instead"})
	case errors.Is(err, store.ErrConflict):
		c.JSON(http.StatusConflict, gin.H{"error": "conflict"})
	default:
		serverError(c, err)
	}
	return true
}

func validDay(s string) bool {
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

// dayRange reads ?from&to (inclusive, at most 366 days).
func dayRange(c *gin.Context) (string, string, bool) {
	from, to := c.Query("from"), c.Query("to")
	a, err1 := time.Parse("2006-01-02", from)
	b, err2 := time.Parse("2006-01-02", to)
	if err1 != nil || err2 != nil || b.Before(a) || b.Sub(a) > 366*24*time.Hour {
		badRequest(c, "from and to must be dates (YYYY-MM-DD), to >= from, at most a year apart")
		return "", "", false
	}
	return from, to, true
}

func clean(s string, max int) (string, bool) {
	s = strings.TrimSpace(s)
	return s, len(s) <= max
}

// ---------- settings, members, rates (owner) ----------

func (h *BillingHandler) GetSettings(c *gin.Context) {
	s, err := h.store.GetBillingSettings(c.Request.Context(), bizOf(c))
	if storeError(c, err, "business") {
		return
	}
	c.JSON(http.StatusOK, s)
}

type settingsReq struct {
	Currency       string `json:"currency"`
	BillingDetails string `json:"billing_details"`
}

func (h *BillingHandler) UpdateSettings(c *gin.Context) {
	var req settingsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	req.Currency = strings.ToUpper(strings.TrimSpace(req.Currency))
	if !billing.ValidCurrency(req.Currency) {
		badRequest(c, "currency must be a 3-letter code like USD")
		return
	}
	details, ok := clean(req.BillingDetails, 2000)
	if !ok {
		badRequest(c, "billing details are too long")
		return
	}
	if storeError(c, h.store.UpdateBillingSettings(c.Request.Context(), bizOf(c), req.Currency, details), "business") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *BillingHandler) Members(c *gin.Context) {
	today := c.Query("today")
	if !validDay(today) {
		today = time.Now().UTC().Format("2006-01-02")
	}
	list, err := h.store.BillingMembers(c.Request.Context(), bizOf(c), today)
	if storeError(c, err, "business") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"members": list})
}

func (h *BillingHandler) Rates(c *gin.Context) {
	list, err := h.store.ListRates(c.Request.Context(), bizOf(c))
	if storeError(c, err, "business") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"rates": list})
}

type rateReq struct {
	UserID        string `json:"user_id"`
	RateCents     int    `json:"rate_cents"`
	EffectiveFrom string `json:"effective_from"`
}

func (h *BillingHandler) SetRate(c *gin.Context) {
	var req rateReq
	if err := c.ShouldBindJSON(&req); err != nil || req.UserID == "" {
		badRequest(c, "invalid body")
		return
	}
	if req.RateCents < 0 || req.RateCents > 100_000_000_00 || !validDay(req.EffectiveFrom) {
		badRequest(c, "rate must be 0 or more and effective_from a date")
		return
	}
	if role, err := h.store.MemberRole(c.Request.Context(), req.UserID, bizOf(c)); err != nil {
		serverError(c, err)
		return
	} else if role == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "member not found"})
		return
	}
	if storeError(c, h.store.SetRate(c.Request.Context(), bizOf(c), req.UserID, req.RateCents, req.EffectiveFrom), "member") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *BillingHandler) DeleteRate(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("rid"), 10, 64)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "rate not found"})
		return
	}
	if storeError(c, h.store.DeleteRate(c.Request.Context(), bizOf(c), id), "rate") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------- projects (owner) ----------

func (h *BillingHandler) Projects(c *gin.Context) {
	list, err := h.store.ListProjects(c.Request.Context(), bizOf(c))
	if storeError(c, err, "business") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"projects": list})
}

func (h *BillingHandler) SaveProject(c *gin.Context) {
	var req store.Project
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	var ok bool
	req.Name, ok = clean(req.Name, 200)
	if req.Name == "" || !ok {
		badRequest(c, "a project needs a name (up to 200 characters)")
		return
	}
	if req.RateCents != nil && (*req.RateCents < 0 || *req.RateCents > 100_000_000_00) {
		badRequest(c, "rate must be 0 or more")
		return
	}
	req.ID = c.Param("pid")
	out, err := h.store.SaveProject(c.Request.Context(), bizOf(c), req)
	if storeError(c, err, "project") {
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *BillingHandler) DeleteProject(c *gin.Context) {
	if storeError(c, h.store.DeleteProject(c.Request.Context(), bizOf(c), c.Param("pid")), "project") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------- tasks (owner: all; members: create + edit their own) ----------
// An empty project_id is allowed: the task then belongs to no project (CTR-37).

func (h *BillingHandler) Tasks(c *gin.Context) {
	list, err := h.store.ListTasks(c.Request.Context(), bizOf(c), !isOwner(c))
	if storeError(c, err, "business") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"tasks": list})
}

type taskReq struct {
	ProjectID  string  `json:"project_id"`
	Title      string  `json:"title"`
	Status     string  `json:"status"`
	AssigneeID *string `json:"assignee_id"`
}

func (h *BillingHandler) SaveTask(c *gin.Context) {
	var req taskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	title, ok := clean(req.Title, 300)
	if title == "" || !ok {
		badRequest(c, "a task needs a title (up to 300 characters)")
		return
	}
	if req.Status == "" {
		req.Status = "open"
	}
	if req.Status != "open" && req.Status != "done" {
		badRequest(c, "status must be open or done")
		return
	}
	if req.AssigneeID != nil && *req.AssigneeID == "" {
		req.AssigneeID = nil
	}
	ctx := c.Request.Context()
	me := userOf(c)
	id := c.Param("tid")
	if !isOwner(c) {
		// Members create tasks for themselves and edit only tasks they created or own.
		if id != "" {
			cur, err := h.store.GetTask(ctx, bizOf(c), id)
			if storeError(c, err, "task") {
				return
			}
			if !ptrIs(cur.CreatedBy, me) && !ptrIs(cur.AssigneeID, me) {
				c.JSON(http.StatusForbidden, gin.H{"error": "you can only edit your own tasks"})
				return
			}
			req.AssigneeID = cur.AssigneeID
		} else {
			req.AssigneeID = &me
		}
	} else if id == "" && isWork(c) && req.AssigneeID == nil {
		// An owner creating a task in the desktop app is working on it too (CTR-16).
		// On the web the dialog preselects them, so an explicit empty stays unassigned.
		req.AssigneeID = &me
	}
	out, err := h.store.SaveTask(ctx, bizOf(c), me, store.Task{ID: id, ProjectID: req.ProjectID, Title: title,
		Status: req.Status, AssigneeID: req.AssigneeID})
	if storeError(c, err, "task or project") {
		return
	}
	c.JSON(http.StatusOK, out)
}

func ptrIs(p *string, v string) bool { return p != nil && *p == v }

// TaskDetail (owner): everything logged on one task — time per member, the
// screenshots captured while its timer ran, and each member's typing share
// (CTR-16). ?tz = minutes east of UTC, ?shots = how many screenshots to return.
func (h *BillingHandler) TaskDetail(c *gin.Context) {
	tz, _ := strconv.Atoi(c.Query("tz"))
	if tz < -14*60 || tz > 14*60 {
		badRequest(c, "tz must be minutes east of UTC")
		return
	}
	shots, _ := strconv.Atoi(c.Query("shots"))
	if shots <= 0 || shots > 500 {
		shots = 200
	}
	out, err := h.store.TaskDetail(c.Request.Context(), bizOf(c), c.Param("tid"), tz, shots)
	if storeError(c, err, "task") {
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *BillingHandler) DeleteTask(c *gin.Context) {
	if storeError(c, h.store.DeleteTask(c.Request.Context(), bizOf(c), c.Param("tid")), "task") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------- time entries (owner: everyone's; members: their own) ----------

func (h *BillingHandler) Entries(c *gin.Context) {
	from, to, ok := dayRange(c)
	if !ok {
		return
	}
	f := store.EntryFilter{From: from, To: to, UserID: c.Query("user_id"), ProjectID: c.Query("project_id")}
	if !isOwner(c) {
		f.UserID = userOf(c)
	}
	list, err := h.store.ListEntries(c.Request.Context(), bizOf(c), f)
	if storeError(c, err, "business") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"entries": list})
}

type entryReq struct {
	UserID     string  `json:"user_id"`
	TaskID     string  `json:"task_id"`
	Day        string  `json:"day"`
	DurationS  int     `json:"duration_s"`
	Note       string  `json:"note"`
	Source     string  `json:"source"`
	StartedAt  *string `json:"started_at"`
	EndedAt    *string `json:"ended_at"`
	ClientUUID *string `json:"client_uuid"`
}

func (h *BillingHandler) SaveEntry(c *gin.Context) {
	var req entryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	note, ok := clean(req.Note, 1000)
	if req.TaskID == "" || !validDay(req.Day) || req.DurationS <= 0 || req.DurationS > 86400 || !ok {
		badRequest(c, "time needs a task, a day and a duration between 1 second and 24 hours")
		return
	}
	if req.Source == "" {
		req.Source = "manual"
	}
	if req.Source != "manual" && req.Source != "timer" {
		badRequest(c, "source must be manual or timer")
		return
	}
	for _, t := range []struct {
		name string
		v    *string
	}{{"started_at", req.StartedAt}, {"ended_at", req.EndedAt}} {
		if t.v == nil {
			continue
		}
		if _, err := time.Parse(time.RFC3339, *t.v); err != nil {
			badRequest(c, t.name+" must be an RFC 3339 time")
			return
		}
	}
	if req.ClientUUID != nil && (len(*req.ClientUUID) < 8 || len(*req.ClientUUID) > 64) {
		badRequest(c, "client_uuid must be 8-64 characters")
		return
	}
	ctx := c.Request.Context()
	me := userOf(c)
	id := c.Param("eid")
	if !isOwner(c) || req.UserID == "" {
		req.UserID = me
	}
	if id != "" && !isOwner(c) {
		cur, err := h.store.GetEntry(ctx, bizOf(c), id)
		if storeError(c, err, "time entry") {
			return
		}
		if cur.UserID != me {
			c.JSON(http.StatusNotFound, gin.H{"error": "time entry not found"})
			return
		}
	}
	out, err := h.store.SaveEntry(ctx, bizOf(c), store.TimeEntry{ID: id, UserID: req.UserID, TaskID: req.TaskID,
		Day: req.Day, DurationS: req.DurationS, Note: note, Source: req.Source, StartedAt: req.StartedAt,
		EndedAt: req.EndedAt, ClientUUID: req.ClientUUID})
	if storeError(c, err, "task") {
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *BillingHandler) DeleteEntry(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("eid")
	if !isOwner(c) {
		cur, err := h.store.GetEntry(ctx, bizOf(c), id)
		if storeError(c, err, "time entry") {
			return
		}
		if cur.UserID != userOf(c) {
			c.JSON(http.StatusNotFound, gin.H{"error": "time entry not found"})
			return
		}
	}
	if storeError(c, h.store.DeleteEntry(ctx, bizOf(c), id), "time entry") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Tracked returns automatically tracked time per member per day (?from&to&tz in
// minutes east of UTC), to compare with logged time.
func (h *BillingHandler) Tracked(c *gin.Context) {
	from, to, ok := dayRange(c)
	if !ok {
		return
	}
	tz, _ := strconv.Atoi(c.Query("tz"))
	if tz < -14*60 || tz > 14*60 {
		badRequest(c, "tz must be minutes east of UTC")
		return
	}
	list, err := h.store.TrackedTime(c.Request.Context(), bizOf(c), from, to, tz)
	if storeError(c, err, "business") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"tracked": list})
}

// Context gives the desktop everything it needs in one call: the caller's role,
// active projects (the rate on a project stays hidden), tasks, and the caller's own
// money view — their rate, the workspace currency and the invoice "from"/"to" blocks
// (ticket 159: a member invoices the workspace, so they do see their own rate).
func (h *BillingHandler) Context(c *gin.Context) {
	ctx := c.Request.Context()
	projects, err := h.store.ListProjects(ctx, bizOf(c))
	if storeError(c, err, "business") {
		return
	}
	type proj struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	active := []proj{}
	for _, p := range projects {
		if !p.Archived {
			active = append(active, proj{p.ID, p.Name})
		}
	}
	tasks, err := h.store.ListTasks(ctx, bizOf(c), true)
	if storeError(c, err, "business") {
		return
	}
	mine, err := h.store.MemberBilling(ctx, bizOf(c), userOf(c), time.Now().UTC().Format("2006-01-02"))
	if storeError(c, err, "member") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"business_id": bizOf(c), "role": c.GetString(ctxRole), "user_id": userOf(c),
		"projects": active, "tasks": tasks, "billing": mine})
}

// SetMyBillingDetails stores the member's own "from" block (desktop).
func (h *BillingHandler) SetMyBillingDetails(c *gin.Context) {
	var req struct {
		BillingDetails string `json:"billing_details"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	details, ok := clean(req.BillingDetails, 2000)
	if !ok {
		badRequest(c, "billing details are too long")
		return
	}
	if storeError(c, h.store.SetMemberBillingDetails(c.Request.Context(), bizOf(c), userOf(c), details), "member") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------- invoices (members raise them, the owner receives them) ----------

// invoiceScope limits invoice reads: the owner sees the whole workspace, a member
// only their own.
func invoiceScope(c *gin.Context) string {
	if isOwner(c) && !isWork(c) {
		return ""
	}
	return userOf(c)
}

// issuer is the member raising an invoice. The owner receives invoices and never
// raises one, so owner calls on the /work invoice routes are refused.
func issuer(c *gin.Context) (string, bool) {
	if isOwner(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "the owner receives invoices — members raise them"})
		return "", false
	}
	return userOf(c), true
}

func (h *BillingHandler) Invoices(c *gin.Context) {
	list, err := h.store.ListInvoices(c.Request.Context(), bizOf(c), invoiceScope(c))
	if storeError(c, err, "business") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"invoices": list})
}

// GetInvoice returns the invoice with its lines, plus the workspace it is billed to.
func (h *BillingHandler) GetInvoice(c *gin.Context) {
	ctx := c.Request.Context()
	inv, err := h.store.GetInvoice(ctx, bizOf(c), c.Param("iid"), invoiceScope(c))
	if storeError(c, err, "invoice") {
		return
	}
	settings, err := h.store.GetBillingSettings(ctx, bizOf(c))
	if storeError(c, err, "business") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"invoice": inv, "to": settings})
}

type invoiceReq struct {
	From      string `json:"from"`
	To        string `json:"to"`
	IssueDate string `json:"issue_date"`
	DueDate   string `json:"due_date"`
	TaxBP     int    `json:"tax_bp"`
	Notes     string `json:"notes"`
}

func (r *invoiceReq) validate(c *gin.Context, full bool) bool {
	if !validDay(r.From) || !validDay(r.To) || r.To < r.From || r.TaxBP < 0 || r.TaxBP > 10000 {
		badRequest(c, "pick a period (to on or after from); tax is 0-100%")
		return false
	}
	if full {
		notes, ok := clean(r.Notes, 2000)
		if !validDay(r.IssueDate) || !validDay(r.DueDate) || r.DueDate < r.IssueDate || !ok {
			badRequest(c, "issue and due dates are required (due on or after issue); notes up to 2000 characters")
			return false
		}
		r.Notes = notes
	}
	return true
}

// PreviewInvoice shows the member what their own unbilled time would come to.
func (h *BillingHandler) PreviewInvoice(c *gin.Context) {
	var req invoiceReq
	if err := c.ShouldBindJSON(&req); err != nil || !req.validate(c, false) {
		if err != nil {
			badRequest(c, "invalid body")
		}
		return
	}
	me, ok := issuer(c)
	if !ok {
		return
	}
	d, err := h.store.PreviewInvoice(c.Request.Context(), bizOf(c), me, req.From, req.To, req.TaxBP)
	if storeError(c, err, "member") {
		return
	}
	c.JSON(http.StatusOK, d)
}

func (h *BillingHandler) CreateInvoice(c *gin.Context) {
	var req invoiceReq
	if err := c.ShouldBindJSON(&req); err != nil || !req.validate(c, true) {
		if err != nil {
			badRequest(c, "invalid body")
		}
		return
	}
	me, ok := issuer(c)
	if !ok {
		return
	}
	id, err := h.store.CreateInvoice(c.Request.Context(), bizOf(c), store.NewInvoice{UserID: me,
		From: req.From, To: req.To, IssueDate: req.IssueDate, DueDate: req.DueDate, TaxBP: req.TaxBP, Notes: req.Notes})
	if errors.Is(err, store.ErrConflict) {
		c.JSON(http.StatusConflict, gin.H{"error": "you have no unbilled time in that period"})
		return
	}
	if storeError(c, err, "member") {
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

type invoiceUpdateReq struct {
	Status  *string `json:"status"`
	DueDate *string `json:"due_date"`
	TaxBP   *int    `json:"tax_bp"`
	Notes   *string `json:"notes"`
}

// UpdateInvoice: the member submits their draft (draft → sent) or edits it; the owner
// records payment, takes it back or voids. billing.NextStatus holds the rules.
func (h *BillingHandler) UpdateInvoice(c *gin.Context) {
	var req invoiceUpdateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	if (req.DueDate != nil && !validDay(*req.DueDate)) || (req.TaxBP != nil && (*req.TaxBP < 0 || *req.TaxBP > 10000)) {
		badRequest(c, "due_date must be a date and tax 0-100%")
		return
	}
	if req.Notes != nil {
		n, ok := clean(*req.Notes, 2000)
		if !ok {
			badRequest(c, "notes up to 2000 characters")
			return
		}
		req.Notes = &n
	}
	err := h.store.UpdateInvoice(c.Request.Context(), bizOf(c), c.Param("iid"), invoiceScope(c),
		store.InvoiceUpdate{Status: req.Status, DueDate: req.DueDate, TaxBP: req.TaxBP, Notes: req.Notes,
			ByOwner: invoiceScope(c) == ""})
	if errors.Is(err, store.ErrConflict) {
		c.JSON(http.StatusConflict, gin.H{"error": "that change isn't allowed for this invoice's status"})
		return
	}
	if storeError(c, err, "invoice") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteInvoice removes a draft and releases its time. The member can drop their own;
// the owner can clear a draft left behind in their workspace.
func (h *BillingHandler) DeleteInvoice(c *gin.Context) {
	err := h.store.DeleteInvoice(c.Request.Context(), bizOf(c), c.Param("iid"), invoiceScope(c))
	if errors.Is(err, store.ErrConflict) {
		c.JSON(http.StatusConflict, gin.H{"error": "only drafts can be deleted — void a sent invoice instead"})
		return
	}
	if storeError(c, err, "invoice") {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
