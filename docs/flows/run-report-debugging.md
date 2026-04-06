# Run Report & Debugging

## Run Detail Data Model

A run captures the full execution trace of an agent task. The data model is designed for post-hoc debugging and real-time observation.

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `runs` | Execution session metadata | phase, status, started_at, completed_at, input_tokens, output_tokens, estimated_cost_usd, error_category, error_severity |
| `run_steps` | Individual execution steps | seq, step_type, tool_name, call_id, tool_input (JSONB), tool_output (text), is_error, started_at, completed_at |
| `run_todos` | Agent's task breakdown | seq, title, description, status (pending/in_progress/completed/blocked), blocker |
| `run_artifacts` | Produced outputs | artifact_type, name, content, mime_type |
| `run_events` | Persisted event stream | seq, event_type, payload (JSONB), created_at |
| `run_continuations` | Compaction/resumption packet | compact_summary, pending_todos, key_decisions, changed_files, blockers, open_questions, token_budget_used |
| `run_handoffs` | Delegation records | handoff_type (delegate/escalate/chain), reason, target_run_id, target_team_id, target_agent_id, context_packet |

### Step Types

| step_type | Meaning | call_id | tool_name |
|-----------|---------|---------|-----------|
| `thinking` | Internal reasoning | empty | empty |
| `text` | Output text | empty | empty |
| `tool_use` | Tool invocation start | correlates with tool_result | tool name |
| `tool_result` | Tool invocation output | matches tool_use | tool name |
| `error` | Error during execution | empty | empty |

`call_id` links `tool_use` and `tool_result` steps for the same tool invocation.

## API Endpoints

### Run Management
| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| POST | `/runs` | CreateRun | Create a new run |
| GET | `/runs/{runId}` | GetRun | Get run metadata |
| GET | `/runs` | ListRuns | List runs with pagination |
| GET | `/issues/{id}/runs` | ListRunsByIssue | Runs for a specific issue |
| POST | `/runs/{runId}/start` | StartRun | Start execution |
| POST | `/runs/{runId}/cancel` | CancelRun | Cancel execution |
| POST | `/runs/{runId}/retry` | RetryRun | Create retry run |
| POST | `/runs/{runId}/complete` | CompleteRun | Mark complete |

### Run Detail
| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| GET | `/runs/{runId}/steps` | GetRunSteps | All steps in order |
| GET | `/runs/{runId}/todos` | GetRunTodos | Agent's task list |
| GET | `/runs/{runId}/artifacts` | GetRunArtifacts | Produced files/reports |
| POST | `/runs/{runId}/steps` | RecordStep | Record a new step |
| POST | `/runs/{runId}/todos` | CreateRunTodo | Add a todo |
| PUT | `/runs/{runId}/todos/{todoId}` | UpdateRunTodo | Update todo status |
| GET | `/runs/{runId}/events` | ListRunEvents | Paginated event stream |

### Task Report (Legacy/Extended)
| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| GET | `/tasks/{taskId}/report` | GetTaskReport | Aggregated task report (multi-table JOIN) |
| GET | `/tasks/{taskId}/timeline` | GetTaskTimeline | UNION ALL of messages + checkpoints + reviews |
| GET | `/tasks/{taskId}/artifacts` | GetTaskArtifacts | Same as run artifacts but by task |

## Frontend Components

### Run Detail Page (`app/(dashboard)/runs/[runId]/`)

Components in `_components/`:
- **RunHeader**: Phase badge, timing, token count, cost
- **RunStepsTimeline**: Chronological list of steps with type-specific rendering
- **RunTodoList**: Agent's plan with status indicators
- **RunArtifactList**: Download/view produced files

### Issue Detail — Task Section

In `features/issues/components/`:
- **`task-run-detail.tsx`**: Embedded run viewer within issue detail
- **`task-run-history.tsx`**: List of past runs for the issue
- **`run-timeline.tsx`**: Compact timeline view of steps
- **`timeline-row.tsx`**: Individual step rendering

### Real-time Updates

Run events are streamed via WebSocket:
```
run:created, run:started, run:phase_changed,
run:step_started, run:step_completed,
run:todo_created, run:todo_updated,
run:artifact_created, run:handoff_created,
run:completed, run:failed, run:cancelled
```

Frontend uses `useWSEvent` to update run detail in real-time:
- New steps append to timeline
- Todo status changes update checkmarks
- Completion/failure triggers final state display

## Debugging Workflow

### "Why did the agent do X?"
1. Navigate to issue → Task section → click on run
2. Run steps show chronological thinking → tool calls → outputs
3. `thinking` steps reveal agent's reasoning
4. `tool_use` + `tool_result` pairs show what the agent tried and what it got back
5. `error` steps show failures with context

### "Why did the task fail?"
1. Check task status and error message (via task report API or UI)
2. Open the associated run → look for `error` steps or last `tool_result` with `is_error=true`
3. Check `run.error_category` and `error_severity` (migration 049)
4. Review timeline messages — agent may have reported what went wrong

### "What was the agent's plan?"
1. Check `run_todos` — the agent records its plan as todos
2. Todos have status: pending, in_progress, completed, blocked
3. Blocked todos have `blocker` field explaining what's blocking

### "How much did this cost?"
1. `runs.input_tokens`, `output_tokens`, `estimated_cost_usd`
2. Token counts are incremented during execution via `UpdateTokens()`
3. Per-run cost visible in run header

### "Can I replay what happened?"
1. `run_events` table stores every event with payload and sequence number
2. `ListRunEvents` API supports cursor-based pagination (`after_seq` parameter)
3. Frontend can reconstruct the full execution timeline from events

## Current Gaps

1. **No diff view**: Run artifacts store content but no diffing against baseline. Changed files are listed in continuation packets but not visualized.
2. **No log search**: No full-text search across run steps or messages. Finding specific tool calls requires scrolling.
3. **Step output truncation**: Tool outputs > 8192 chars are truncated during recording. Original output is lost.
4. **No run comparison**: Cannot diff two runs of the same task to see what changed between retries.
5. **Compaction loses detail**: When conversation is compacted, individual thinking steps are replaced with a summary. The original steps are in the DB but the compacted context loses granularity.
6. **No agent trace export**: Cannot export a run's full trace as a shareable file (e.g. HAR-like format for agent execution).
