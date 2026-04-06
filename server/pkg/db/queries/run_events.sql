-- Run Events: persistent event log for replay / catchup.

-- name: CreateRunEvent :one
INSERT INTO run_events (run_id, event_type, payload)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListRunEvents :many
SELECT * FROM run_events
WHERE run_id = $1 AND seq > $2
ORDER BY seq ASC
LIMIT $3;

-- name: ListRunEventsAll :many
SELECT * FROM run_events
WHERE run_id = $1
ORDER BY seq ASC
LIMIT $2;

-- name: CountRunEvents :one
SELECT COUNT(*) FROM run_events
WHERE run_id = $1;

-- name: GetLatestRunEventSeq :one
SELECT COALESCE(MAX(seq), 0) FROM run_events
WHERE run_id = $1;

-- name: DeleteRunEvents :exec
DELETE FROM run_events WHERE run_id = $1;
