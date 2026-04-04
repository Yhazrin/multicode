-- name: CreateRunTodo :one
INSERT INTO run_todos (
    run_id, seq, title, description, status, blocker
) VALUES (
    $1, $2, $3, $4, $5, sqlc.narg(blocker)
)
RETURNING *;

-- name: GetRunTodo :one
SELECT * FROM run_todos
WHERE id = $1;

-- name: UpdateRunTodo :one
UPDATE run_todos SET
    title = COALESCE(sqlc.narg('title'), title),
    description = COALESCE(sqlc.narg('description'), description),
    status = COALESCE(sqlc.narg('status'), status),
    blocker = sqlc.narg(blocker),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ListRunTodos :many
SELECT * FROM run_todos
WHERE run_id = $1
ORDER BY seq ASC;

-- name: GetNextTodoSeq :one
SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
FROM run_todos
WHERE run_id = $1;

-- name: DeleteRunTodos :exec
DELETE FROM run_todos
WHERE run_id = $1;
