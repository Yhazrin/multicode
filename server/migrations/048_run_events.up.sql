-- Run events: persistent event log for run lifecycle.
-- Enables cursor-based replay for frontend reconnection catchup.

CREATE TABLE IF NOT EXISTS run_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    seq BIGSERIAL,                              -- global ordering for cursor pagination
    event_type TEXT NOT NULL,                   -- e.g. "run:started", "run:step_completed"
    payload JSONB NOT NULL DEFAULT '{}',        -- event-specific data
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cursor pagination: "give me events after seq N for this run"
CREATE INDEX IF NOT EXISTS idx_run_events_run_seq ON run_events(run_id, seq);

-- Global seq index for cross-run queries (unlikely but cheap)
CREATE INDEX IF NOT EXISTS idx_run_events_seq ON run_events(seq);
