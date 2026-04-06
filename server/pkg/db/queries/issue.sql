-- name: ListIssues :many
SELECT * FROM issue
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('priority')::text IS NULL OR priority = sqlc.narg('priority'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR assignee_id = sqlc.narg('assignee_id'))
ORDER BY position ASC, created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetIssue :one
SELECT * FROM issue
WHERE id = $1;

-- name: GetIssueInWorkspace :one
SELECT * FROM issue
WHERE id = $1 AND workspace_id = $2;

-- name: CreateIssue :one
INSERT INTO issue (
    workspace_id, title, description, status, priority,
    assignee_type, assignee_id, creator_type, creator_id,
    parent_issue_id, position, due_date, number, repo_id, issue_kind
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
    COALESCE(NULLIF($15, ''), 'task')
) RETURNING *;

-- name: GetIssueByNumber :one
SELECT * FROM issue
WHERE workspace_id = $1 AND number = $2;

-- name: UpdateIssue :one
UPDATE issue SET
    title = COALESCE(sqlc.narg('title'), title),
    description = COALESCE(sqlc.narg('description'), description),
    status = COALESCE(sqlc.narg('status'), status),
    priority = COALESCE(sqlc.narg('priority'), priority),
    assignee_type = sqlc.narg('assignee_type'),
    assignee_id = sqlc.narg('assignee_id'),
    position = COALESCE(sqlc.narg('position'), position),
    due_date = sqlc.narg('due_date'),
    repo_id = COALESCE(sqlc.narg('repo_id'), repo_id),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateIssueStatus :one
UPDATE issue SET
    status = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteIssue :exec
DELETE FROM issue WHERE id = $1;

-- name: ListIssuesByIDs :many
SELECT * FROM issue
WHERE id = ANY($1::uuid[]) AND workspace_id = $2;

-- name: GetIssuesByIDs :many
SELECT * FROM issue WHERE id = ANY($1::uuid[]);

-- name: BatchDeleteIssues :exec
DELETE FROM issue WHERE id = ANY($1::uuid[]) AND workspace_id = $2;

-- name: SearchIssues :many
SELECT * FROM issue
WHERE workspace_id = $1
  AND (
    title ILIKE '%' || $2 || '%'
    OR description ILIKE '%' || $2 || '%'
    OR CAST(number AS TEXT) = $2
  )
ORDER BY
  CASE WHEN title ILIKE $2 || '%' THEN 0 ELSE 1 END,
  position ASC, created_at DESC
LIMIT $3;

-- name: ListIssuesWithTaskStatus :many
SELECT i.*, COALESCE(lt.latest_task_status, '') AS latest_task_status
FROM issue i
LEFT JOIN LATERAL (
    SELECT atq.status AS latest_task_status
    FROM agent_task_queue atq
    WHERE atq.issue_id = i.id
    ORDER BY atq.created_at DESC
    LIMIT 1
) lt ON true
WHERE i.workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR i.status = sqlc.narg('status'))
  AND (sqlc.narg('priority')::text IS NULL OR i.priority = sqlc.narg('priority'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR i.assignee_id = sqlc.narg('assignee_id'))
ORDER BY i.position ASC, i.created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListIssuesWithTaskStatusCursor :many
SELECT i.*, COALESCE(lt.latest_task_status, '') AS latest_task_status
FROM issue i
LEFT JOIN LATERAL (
    SELECT atq.status AS latest_task_status
    FROM agent_task_queue atq
    WHERE atq.issue_id = i.id
    ORDER BY atq.created_at DESC
    LIMIT 1
) lt ON true
WHERE i.workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR i.status = sqlc.narg('status'))
  AND (sqlc.narg('priority')::text IS NULL OR i.priority = sqlc.narg('priority'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR i.assignee_id = sqlc.narg('assignee_id'))
  AND (
    sqlc.narg('cursor_position')::float8 IS NULL
    OR i.position > sqlc.narg('cursor_position')::float8
    OR (i.position = sqlc.narg('cursor_position')::float8
        AND i.created_at < sqlc.narg('cursor_created_at')::timestamptz)
    OR (i.position = sqlc.narg('cursor_position')::float8
        AND i.created_at = sqlc.narg('cursor_created_at')::timestamptz
        AND i.id > sqlc.narg('cursor_id')::uuid)
  )
ORDER BY i.position ASC, i.created_at DESC, i.id ASC
LIMIT $2;
