-- name: ListWebhooksByWorkspace :many
SELECT * FROM webhooks
WHERE workspace_id = $1
ORDER BY created_at ASC;

-- name: GetWebhook :one
SELECT * FROM webhooks
WHERE id = $1;

-- name: ListActiveWebhooksByWorkspace :many
SELECT * FROM webhooks
WHERE workspace_id = $1 AND is_active = true
ORDER BY created_at ASC;

-- name: CreateWebhook :one
INSERT INTO webhooks (
    workspace_id, url, secret, event_types
) VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateWebhook :one
UPDATE webhooks SET
    url = COALESCE(sqlc.narg('url'), url),
    secret = COALESCE(sqlc.narg('secret'), secret),
    event_types = COALESCE(sqlc.narg('event_types'), event_types),
    is_active = COALESCE(sqlc.narg('is_active'), is_active)
WHERE id = $1
RETURNING *;

-- name: DeleteWebhook :exec
DELETE FROM webhooks
WHERE id = $1;

-- name: CleanupOutbox :exec
DELETE FROM outbox
WHERE created_at < now() - INTERVAL '7 days';
