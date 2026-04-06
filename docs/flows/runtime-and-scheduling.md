# Runtime & Scheduling

## Runtime Registration

### Initial Registration

Two paths for registering a runtime:

**Path 1: Daemon register** (`POST /api/daemon/register`)
- Authenticated via JWT/PAT (`middleware.Auth`)
- Upserts `agent_runtime` row
- Sets `status=online`, updates `last_heartbeat_at`
- Returns agent list, workspace config, workspace repos

**Path 2: Join token** (`POST /api/daemon/register-with-join-token`)
- Public endpoint (no auth middleware)
- Validates join token (not expired, not exhausted)
- Creates runtime with `approval_status=pending` (if token requires approval) or `approved`
- Creates audit log entry
- Returns same data as Path 1

### Heartbeat

`POST /api/daemon/heartbeat`
- Daemon sends heartbeats periodically (configurable via `HEARTBEAT_INTERVAL`, default 30s)
- Updates `last_heartbeat_at` on `agent_runtime`
- Returns agent configs (so daemon can react to config changes)

### Sweeping

`runtime_sweeper.go` runs as a background goroutine:
- Periodically checks all `online` runtimes
- If `last_heartbeat_at` is older than threshold → sets `status=offline`
- Also reconciles agent status for agents bound to offlined runtimes

## Runtime Selection Algorithm

**Location**: `service/runtime_selector.go: SelectRuntime()`

Called during task enqueue (not during claim). The selected runtime ID is stored on the task.

### Decision Flow

```
1. Load agent
2. Try loading RuntimeAssignmentPolicy for this agent
   ├── No policy or inactive → return agent.RuntimeID (default)
   └── Policy found →
3. Load all runtimes in workspace
4. Filter: isRuntimeEligible()
   - status == "online"
   - not paused
   - not drain_mode
   - approval_status == "" or "approved"
5. Filter: tagsMatch()
   - required_tags ⊆ runtime.tags
   - forbidden_tags ∩ runtime.tags == ∅
6. Score each candidate:
   - tier = preferred(0) / fallback(1) / normal(2)
   - loadScore = avg_task_duration_ms/1000 + failure_rate_penalty
   - final_score = tier * 1_000_000 + loadScore
7. Apply max_queue_depth filter (if set):
   - Count pending tasks per runtime
   - Remove runtimes exceeding depth
   - If ALL exceed, keep all (fall through)
8. Sort by score (ascending), pick first
9. If no candidates → fallback to agent.RuntimeID
```

### Scoring Details

```
loadScore = avg_task_duration_ms / 1000
          + (failure_count_24h / total_24h * 100) * 10

final_score = tier * 1_000_000 + loadScore
```

This ensures tier always dominates: a preferred runtime with high load still beats a fallback runtime with zero load.

### What's NOT Implemented

1. **Geographic/latency-based selection**: No region awareness
2. **Runtime capability matching**: Tags are the only differentiation
3. **Cost-based selection**: No pricing model per runtime
4. **Sticky sessions**: No preference for the runtime that previously worked on the same issue/repo
5. **Dynamic rebalancing**: If a runtime goes offline after task enqueue, the task stays assigned to it until the daemon tries to claim and finds nothing

## Queue Management

### Enqueue
- `CreateAgentTask` inserts into `agent_task_queue` with `status=queued`
- Priority mapped from issue priority: urgent=4, high=3, medium=2, low=1, none=0
- Unique constraint: `(agent_id, issue_id)` where status NOT IN (completed, failed, cancelled) — prevents duplicate active tasks for same issue

### Claim
- `ClaimAgentTask` SQL uses `FOR UPDATE SKIP LOCKED` for concurrent-safe claiming
- Ordered by priority DESC, created_at ASC (highest priority, oldest first)
- Agent `max_concurrent_tasks` checked before claim attempt

### Stale Task Detection
- `FailStaleTasks` query: marks tasks stuck in `dispatched` or `running` for too long as `failed`
- Called by the runtime sweeper when a runtime goes offline

## Drain Mode

When a runtime is set to `drain_mode=true`:
1. `isRuntimeEligible()` returns false → no new tasks assigned
2. Existing running tasks continue to completion
3. Once all tasks finish, runtime can be safely decommissioned

**Activation**: `PUT /api/workspaces/{id}/runtimes/{runtimeId}/drain` (handler `runtime_pool.go`)

## Pause Mode

Similar to drain but reversible:
1. `paused=true` → `isRuntimeEligible()` returns false
2. Existing tasks continue
3. Resume via `PUT /api/workspaces/{id}/runtimes/{runtimeId}/resume`

## Runtime Pool Operations

All in `handler/runtime_pool.go`:

| Operation | Endpoint | Effect |
|-----------|----------|--------|
| Create join token | POST `.../join-tokens` | Generates a token for new runtimes to self-register |
| Approve runtime | POST `.../runtimes/{id}/approve` | Changes approval_status to approved |
| Reject runtime | POST `.../runtimes/{id}/reject` | Changes approval_status to rejected |
| Revoke runtime | POST `.../runtimes/{id}/revoke` | Changes approval_status to revoked |
| Pause runtime | PUT `.../runtimes/{id}/pause` | Sets paused=true |
| Resume runtime | PUT `.../runtimes/{id}/resume` | Sets paused=false |
| Drain runtime | PUT `.../runtimes/{id}/drain` | Sets drain_mode=true |
| Audit logs | GET `.../runtimes/{id}/audit` | Lists runtime_audit_log entries |

## Frontend Integration

### Runtimes Page (`app/(dashboard)/runtimes/page.tsx`)
- Lists all runtimes with status indicators
- Approval/rejection actions
- Pause/resume/drain controls
- Usage statistics display

### Runtime Policy UI (verified via E2E)
- Policy CRUD per agent
- Preferred/fallback runtime selection
- Tag constraints
- Queue depth limits
