package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/alphenix/server/pkg/db/generated"
)

// WebhookResponse is the JSON representation of a webhook.
type WebhookResponse struct {
	ID          string   `json:"id"`
	WorkspaceID string   `json:"workspace_id"`
	URL         string   `json:"url"`
	EventTypes  []string `json:"event_types"`
	IsActive    bool     `json:"is_active"`
	CreatedAt   string   `json:"created_at"`
}

func webhookToResponse(w db.Webhook) WebhookResponse {
	return WebhookResponse{
		ID:          uuidToString(w.ID),
		WorkspaceID: uuidToString(w.WorkspaceID),
		URL:         w.Url,
		EventTypes:  w.EventTypes,
		IsActive:    w.IsActive,
		CreatedAt:   w.CreatedAt.Time.Format("2006-01-02T15:04:05Z"),
	}
}

// ListWebhooks returns all webhooks in the workspace.
func (h *Handler) ListWebhooks(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceID")
	if _, ok := h.requireWorkspaceMember(w, r, workspaceID, "workspace not found"); !ok {
		return
	}

	webhooks, err := h.Queries.ListWebhooksByWorkspace(r.Context(), parseUUID(workspaceID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list webhooks")
		return
	}

	result := make([]WebhookResponse, len(webhooks))
	for i, wh := range webhooks {
		result[i] = webhookToResponse(wh)
	}
	writeJSON(w, http.StatusOK, result)
}

// GetWebhook returns a single webhook by ID.
func (h *Handler) GetWebhook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wh, err := h.Queries.GetWebhook(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "webhook not found")
		return
	}

	workspaceID := uuidToString(wh.WorkspaceID)
	if _, ok := h.requireWorkspaceMember(w, r, workspaceID, "workspace not found"); !ok {
		return
	}

	writeJSON(w, http.StatusOK, webhookToResponse(wh))
}

// CreateWebhookRequest is the request body for creating a webhook.
type CreateWebhookRequest struct {
	URL        string   `json:"url"`
	EventTypes []string `json:"event_types"`
}

// CreateWebhook creates a new webhook for the workspace.
func (h *Handler) CreateWebhook(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceID")
	if _, ok := h.requireWorkspaceRole(w, r, workspaceID, "webhook not found", "owner", "admin"); !ok {
		return
	}

	var req CreateWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.URL == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}

	secret := generateSecret()

	wh, err := h.Queries.CreateWebhook(r.Context(), db.CreateWebhookParams{
		WorkspaceID: parseUUID(workspaceID),
		Url:         req.URL,
		Secret:      secret,
		EventTypes:  req.EventTypes,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create webhook")
		return
	}

	writeJSON(w, http.StatusCreated, webhookToResponse(wh))
}

// UpdateWebhookRequest is the request body for updating a webhook.
type UpdateWebhookRequest struct {
	URL        *string   `json:"url"`
	EventTypes *[]string `json:"event_types"`
	IsActive   *bool     `json:"is_active"`
}

// UpdateWebhook updates an existing webhook.
func (h *Handler) UpdateWebhook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	existing, err := h.Queries.GetWebhook(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "webhook not found")
		return
	}

	workspaceID := uuidToString(existing.WorkspaceID)
	if _, ok := h.requireWorkspaceRole(w, r, workspaceID, "webhook not found", "owner", "admin"); !ok {
		return
	}

	var req UpdateWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := db.UpdateWebhookParams{
		ID: parseUUID(id),
	}
	if req.URL != nil {
		params.Url = pgtype.Text{String: *req.URL, Valid: true}
	}
	if req.EventTypes != nil {
		params.EventTypes = *req.EventTypes
	}
	if req.IsActive != nil {
		params.IsActive = pgtype.Bool{Bool: *req.IsActive, Valid: true}
	}

	wh, err := h.Queries.UpdateWebhook(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update webhook")
		return
	}

	writeJSON(w, http.StatusOK, webhookToResponse(wh))
}

// DeleteWebhook deletes a webhook.
func (h *Handler) DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	existing, err := h.Queries.GetWebhook(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "webhook not found")
		return
	}

	workspaceID := uuidToString(existing.WorkspaceID)
	if _, ok := h.requireWorkspaceRole(w, r, workspaceID, "webhook not found", "owner", "admin"); !ok {
		return
	}

	if err := h.Queries.DeleteWebhook(r.Context(), parseUUID(id)); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete webhook")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// generateSecret creates a random 32-byte hex-encoded secret for webhook signing.
func generateSecret() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		// Fallback — should never happen on modern systems.
		return "fallback-secret-" + hex.EncodeToString(b)
	}
	return hex.EncodeToString(b)
}
