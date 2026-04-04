CREATE TABLE attachment (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    issue_id      UUID REFERENCES issue(id) ON DELETE CASCADE,
    comment_id    UUID REFERENCES comment(id) ON DELETE CASCADE,
    uploader_type TEXT NOT NULL CHECK (uploader_type IN ('member', 'agent')),
    uploader_id   UUID NOT NULL,
    filename      TEXT NOT NULL,
    url           TEXT NOT NULL,
    content_type  TEXT NOT NULL,
    size_bytes    BIGINT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachment_issue ON attachment(issue_id) WHERE issue_id IS NOT NULL;
CREATE INDEX idx_attachment_comment ON attachment(comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX idx_attachment_workspace ON attachment(workspace_id);

CREATE TABLE daemon_token (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    daemon_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_daemon_token_hash ON daemon_token(token_hash);
CREATE INDEX idx_daemon_token_workspace_daemon ON daemon_token(workspace_id, daemon_id);

DROP TABLE IF EXISTS daemon_pairing_session;
