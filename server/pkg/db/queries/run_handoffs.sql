-- name: CreateRunHandoff :one
INSERT INTO run_handoffs (
    source_run_id, target_run_id, handoff_type,
    target_team_id, target_agent_id, reason, context_packet
) VALUES (
    $1, sqlc.narg(target_run_id), $2,
    sqlc.narg(target_team_id), sqlc.narg(target_agent_id), $3, sqlc.narg(context_packet)
)
RETURNING *;

-- name: GetRunHandoff :one
SELECT * FROM run_handoffs
WHERE id = $1;

-- name: ListHandoffsBySource :many
SELECT * FROM run_handoffs
WHERE source_run_id = $1
ORDER BY created_at DESC;

-- name: ListHandoffsByTarget :many
SELECT * FROM run_handoffs
WHERE target_run_id = $1
ORDER BY created_at DESC;

-- name: DeleteRunHandoffs :exec
DELETE FROM run_handoffs
WHERE source_run_id = $1;
