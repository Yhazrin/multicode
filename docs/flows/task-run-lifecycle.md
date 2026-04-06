# Task & Run Lifecycle

## Task Lifecycle

### Creation

Tasks are created through two paths:

**Path 1: Issue assignment** (`service/task.go: EnqueueTaskForIssue`)
1. Issue gets assigned to an agent (via UI or API)
2. `handler/issue.go` checks agent triggers — if auto-trigger on assignment, calls `TaskService.EnqueueTaskForIssue()`
3. Validates: issue has assignee, agent exists and is not archived, agent has a runtime
4. `SelectRuntime()` picks best runtime (policy-based or agent default)
5. Creates `agent_task_queue` row with status `queued`

**Path 2: @mention in comment** (`handler/comment.go` → `EnqueueTaskForMention`)
1. Comment with `@agent-name` is created
2. Comment handler detects mention, resolves agent
3. Calls `TaskService.EnqueueTaskForMention()` with explicit agent ID
4. Same validation and runtime selection as Path 1

**Path 3: Task chaining** (`service/task.go: ChainTask`)
1. A running task creates a follow-up for another agent
2. Source task ID stored as `chain_source_task_id`
3. Chain reason stored for context

### Claiming

The daemon polls for tasks via `POST /api/daemon/runtimes/{runtimeId}/tasks/claim`.

**`ClaimTaskForRuntime`** (service/task.go):
1. Lists pending tasks for this runtime (`ListPendingTasksByRuntime`)
2. For each unique agent in pending list, tries `ClaimTask(agentID)`
3. `ClaimTask` checks `max_concurrent_tasks` against running count
4. If capacity exists, executes `ClaimAgentTask` SQL — `FOR UPDATE SKIP LOCKED` ensures atomic claim
5. Task transitions: `queued → dispatched`
6. Agent status updated to `working`
7. WS events broadcast: `task:dispatch`, `agent:started`

**Important**: `ClaimTaskForRuntime` iterates through agents, not tasks. If a claimed task's `runtime_id` doesn't match the requesting runtime, the loop continues. This can happen when runtime selection policy changes between enqueue and claim.

### Execution

After claiming, the daemon:

1. Calls `POST /api/daemon/tasks/{taskId}/start`
   - `StartTask`: validates `dispatched → running` transition
   - No issue status change (agent manages via CLI)

2. Assembles system prompt (see `prompt-and-context-assembly.md`)
3. Executes via agent backend (Claude Code / Codex / OpenCode)
4. Reports progress via `POST /api/daemon/tasks/{taskId}/progress`
5. Reports messages via `POST /api/daemon/tasks/{taskId}/messages`

### Completion

**Without review** (`max_reviews = 0`):
1. Daemon calls `POST /api/daemon/tasks/{taskId}/complete`
2. `CompleteTask`: validates `running → completed` transition
3. Posts agent output as comment on issue (if not comment-triggered)
4. `ReconcileAgentStatus()` — sets agent to `idle` if no more running tasks
5. Checks dependent tasks — publishes `task:dependencies_satisfied` if all deps met
6. Broadcasts `task:completed`, `agent:completed`

**With review** (`max_reviews > 0`):
1. `CompleteTask`: transitions to `in_review` instead of `completed`
2. Posts agent output as comment
3. Broadcasts `task:in_review`
4. Spawns goroutine: `reviewService.ReviewTask(taskID)`
5. Review verdict:
   - `pass` → task transitions to `completed`
   - `fail` → task transitions to `failed`
   - `retry` → task transitions back to `queued` (re-enters the claim cycle)

### Failure

1. Daemon calls `POST /api/daemon/tasks/{taskId}/fail`
2. `FailTask`: validates `* → failed` transition
3. Posts error as system comment on issue
4. `ReconcileAgentStatus()`
5. Broadcasts `task:failed`, `agent:failed`

### Cancellation

**Single task**: `TaskService.CancelTask(taskID)`
- Validates transition, updates DB, reconciles agent status, broadcasts `task:cancelled`

**All tasks for issue**: `TaskService.CancelTasksForIssue(issueID)`
- Lists active tasks, cancels all, broadcasts per-task, reconciles each agent

### Retry

`RetryTask` in handler sets status back to `queued` (via `failed → queued` transition), re-entering the claim cycle.

## Run Lifecycle

### Creation

Runs are created in two contexts:

1. **Daemon-initiated**: When daemon starts executing a claimed task, handler `run.go` calls `RunOrchestrator.GetOrCreateRun()` — idempotent per task
2. **Decompose/Fork**: `decompose.go` and `fork.go` create runs directly (though these routes are currently unregistered)

Run starts in `pending` phase, `pending` status.

### Execution

`RunOrchestrator.ExecuteRun()` is the core orchestration loop:

```
1. StartRun() → pending → active/executing
2. Backend.Execute(prompt, options) → creates Session
3. For each message from session.Messages channel:
   - MessageThinking → Coalescer(fold) → StepCoalescer(thinking) → RecordStep
   - MessageText → Coalescer(fold) → StepCoalescer(text) → RecordStep
   - MessageToolUse → record step start (no output)
   - MessageToolResult → record step completion (with output)
   - MessageError → record error step
   - After each batch: check Compactor.NeedsCompaction()
     - If needed: flush coalescers, compact conversation, log
4. Close coalescers, flush pending events
5. Wait for session.Result
6. CompleteRun() or FailRun() based on result.Status
```

### Step Recording

`RecordStep()`:
1. Gets next sequence number for the run
2. Creates `run_steps` row with seq, type, tool info, timestamps
3. Broadcasts `run:step_started` or `run:step_completed` via `BroadcastRunEvent()`

`BroadcastRunEvent()`:
1. Persists to `run_events` table first (at-least-once guarantee)
2. Then broadcasts via event bus → WS hub → frontend

### Compaction

When conversation grows too large:
1. `Compactor.NeedsCompaction(messages)` checks token budget
2. `Compactor.Compact(ctx, messages, AutoCompact)` — uses LLM to summarize
3. Replaces conversation with summary + recent messages
4. Creates `RunContinuation` with pending todos, key decisions, etc.

### Phase Transitions

**WARNING**: No validation on phase transitions. `AdvancePhase()` accepts any string:

```go
func (o *RunOrchestrator) AdvancePhase(ctx context.Context, runID string, newPhase string) (db.Run, error) {
    // No validation against allowed transitions
    run, err := o.Queries.UpdateRunPhase(ctx, ...)
}
```

This is a gap compared to the task state machine which validates all transitions.

### Completion/Failure/Cancellation

- `CompleteRun()`: Sets `phase=completed`, `status=completed`, `completed_at=now()`. Broadcasts `run:completed` with token counts.
- `FailRun()`: Sets `phase=failed`, `status=failed`, `completed_at=now()`. Broadcasts `run:failed` with error.
- `CancelRun()`: Sets `phase=cancelled`, `status=cancelled`, `completed_at=now()`. Broadcasts `run:cancelled`.
- `RetryRun()`: Creates a new run with `parent_run_id` pointing to the original.

## Frontend Display

### Issue Detail Page (`features/issues/components/issue-detail.tsx`)
- Shows task history via `useTaskAndAgent` hook
- Active task shown via `AgentLiveCard` component
- `TaskRunHistory` shows past runs with status
- `TaskRunDetail` shows individual run timeline

### Run Detail Page (`app/(dashboard)/runs/[runId]/page.tsx`)
- Fetches run, steps, todos, artifacts via API
- `RunTimeline` displays step-by-step execution
- Real-time updates via `useWSEvent` for run events
- Step types rendered differently: thinking (collapsible), tool_use (input/output), text, error

### Real-time Updates
- WS events: `task:*`, `agent:*`, `run:*` event families
- `use-realtime-sync.ts` handles global store updates
- Component-level `useWSEvent` for detail-specific updates (e.g. new steps during run)
