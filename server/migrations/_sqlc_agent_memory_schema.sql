-- Standalone schema for sqlc code generation.
-- The real table is created conditionally in migration 036 (requires pgvector),
-- which sqlc cannot parse. This file ensures sqlc generates the correct code.
-- Does NOT affect runtime — it's only read by sqlc during code generation.

CREATE TABLE IF NOT EXISTS agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    tsv_content tsvector,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);
