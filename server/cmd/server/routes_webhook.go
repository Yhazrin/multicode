package main

import (
	"github.com/go-chi/chi/v5"
	"github.com/multica-ai/alphenix/server/internal/handler"
	"github.com/multica-ai/alphenix/server/internal/middleware"
	db "github.com/multica-ai/alphenix/server/pkg/db/generated"
)

// registerWebhookRoutes registers webhook CRUD routes.
func registerWebhookRoutes(r chi.Router, h *handler.Handler, queries *db.Queries) {
	r.Route("/api/workspaces/{workspaceID}/webhooks", func(r chi.Router) {
		r.Get("/", h.ListWebhooks)
		r.With(middleware.RequireWorkspaceRole(queries, "owner", "admin")).Post("/", h.CreateWebhook)
		r.Route("/{id}", func(r chi.Router) {
			r.Get("/", h.GetWebhook)
			r.With(middleware.RequireWorkspaceRole(queries, "owner", "admin")).Put("/", h.UpdateWebhook)
			r.With(middleware.RequireWorkspaceRole(queries, "owner", "admin")).Delete("/", h.DeleteWebhook)
		})
	})
}
