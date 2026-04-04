-- name: CreateRunContinuation :one
INSERT INTO run_continuations (
    run_id, compact_summary, pending_todos, key_decisions,
    changed_files, blockers, open_questions, token_budget_used
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING *;

-- name: GetRunContinuation :one
SELECT * FROM run_continuations
WHERE id = $1;

-- name: GetLatestContinuation :one
SELECT * FROM run_continuations
WHERE run_id = $1
ORDER BY created_at DESC
LIMIT 1;

-- name: ListRunContinuations :many
SELECT * FROM run_continuations
WHERE run_id = $1
ORDER BY created_at DESC;

-- name: DeleteRunContinuations :exec
DELETE FROM run_continuations
WHERE run_id = $1;
