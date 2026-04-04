-- name: CreateRunArtifact :one
INSERT INTO run_artifacts (
    run_id, step_id, artifact_type, name, content, mime_type
) VALUES (
    $1, sqlc.narg(step_id), $2, $3, $4, $5
)
RETURNING *;

-- name: GetRunArtifact :one
SELECT * FROM run_artifacts
WHERE id = $1;

-- name: ListRunArtifacts :many
SELECT * FROM run_artifacts
WHERE run_id = $1
ORDER BY created_at ASC;

-- name: ListRunArtifactsByType :many
SELECT * FROM run_artifacts
WHERE run_id = $1 AND artifact_type = $2
ORDER BY created_at ASC;

-- name: DeleteRunArtifact :exec
DELETE FROM run_artifacts
WHERE id = $1;

-- name: DeleteRunArtifacts :exec
DELETE FROM run_artifacts
WHERE run_id = $1;
