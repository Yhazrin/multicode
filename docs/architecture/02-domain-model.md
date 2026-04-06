# Domain Model

## Core Entities

### Workspace
The multi-tenancy boundary. All queries filter by `workspace_id`. Contains members, agents, issues, runtimes, skills, teams, repos, and MCP servers.

**Key fields**: `id`, `name`, `slug`, `issue_prefix` (e.g. "MUL"), `issue_counter` (auto-increment), `repos` (legacy JSONB, migrated to `workspace_repo` table)

### Member
A human user's membership in a workspace. Role-based access: `owner`, `admin`, `member`.

### Agent
An AI worker configured to execute tasks. Key configuration:
- `instructions`: Custom system prompt content
- `runtime_mode`: `local` (daemon) or `cloud`
- `runtime_id` → `agent_runtime`: Which runtime executes this agent
- `max_concurrent_tasks`: Concurrency limit per agent
- `max_reviews`: If > 0, tasks go through review before completion
- `status`: `idle`, `working`, `blocked`, `error`, `offline` (auto-reconciled)
- `tools`: JSON array of allowed MCP/built-in tools
- `triggers`: JSON object defining auto-trigger conditions (e.g. on assignment)

### Issue
A work item. Can be a `goal` (decomposable) or `task` (leaf work unit).

**Status machine**:
```
backlog → todo → in_progress → in_review → done
                            ↘ blocked      ↗
                              cancelled
```
No formal state machine enforcement at DB level — status is a CHECK-constrained string.

**Assignee polymorphism**: `assignee_type` is `member`, `agent`, or `team` with `assignee_id` pointing to the respective table.

### AgentTaskQueue
The work dispatch unit. Created when an agent-assigned issue needs execution.

**State machine** (enforced in `service/task_state.go`):
```
queued ──→ dispatched ──→ running ──→ in_review ──→ completed
  ↑            │             │           │
  │            ↓             ↓           ↓
  ←──── failed ←─── cancelled ←──────────
  └──────────────────────────────────────┘
```

Transitions:
- `queued → dispatched`: ClaimTask (daemon polls)
- `dispatched → running`: StartTask (daemon confirms execution started)
- `running → in_review`: CompleteTask when agent has `max_reviews > 0`
- `in_review → completed`: ReviewService passes
- `in_review → queued`: ReviewService retries
- `* → failed`: Error at any stage
- `* → cancelled`: Manual cancellation
- `failed → queued`: Retry

### AgentRuntime
A daemon instance that can execute agent tasks. Registered via HTTP heartbeat.

**Key fields**:
- `status`: `online` / `offline` (swept by `runtime_sweeper`)
- `provider`: `claude` / `codex` / `opencode`
- `approval_status`: `pending`, `approved`, `rejected`, `revoked`
- `paused`: Temporarily unavailable
- `drain_mode`: Finishing current tasks, rejecting new ones
- `tags`: JSON array for policy matching
- `success_count_24h`, `failure_count_24h`, `avg_task_duration_ms`: Load metrics

### Run
A recorded execution session. Every task execution creates a Run that captures the full conversation and tool usage.

**Phase machine** (NOT formally enforced — any string accepted):
```
pending → planning → executing → reviewing → completed
                                           → failed
                                           → cancelled
```

**Key relationships**:
- `task_id` → optional link to AgentTaskQueue
- `parent_run_id` → self-reference for retries and forks
- `team_id` → team context (no FK enforcement)

### Skill
Reusable instruction content attached to agents. Contains a main `content` field and optional `skill_file` children (supporting files like code templates).

### RuntimeAssignmentPolicy
Per-agent configuration that overrides the default runtime selection:
- `preferred_runtime_ids`: Try these first
- `fallback_runtime_ids`: Try these if preferred unavailable
- `required_tags` / `forbidden_tags`: Runtime tag filtering
- `max_queue_depth`: Maximum pending tasks per runtime

### MCP Server
External tool server configuration. Agents can use MCP servers for extended capabilities.
- `status`: `active` / `inactive`
- `config`: JSON connection configuration

## Key Relationships

```
Workspace ──1:N──→ Member ──N:1──→ User
Workspace ──1:N──→ Agent ──N:1──→ AgentRuntime
Workspace ──1:N──→ Issue ──1:N──→ Comment
                   Issue ──1:N──→ AgentTaskQueue ──1:1──→ Run (optional)
                   Issue ──N:M──→ Issue (dependencies)
                   Issue ──N:1──→ Issue (parent/child)
Agent ────N:M────→ Skill (via agent_skill junction)
Agent ────1:1────→ RuntimeAssignmentPolicy
AgentTaskQueue ──1:N──→ TaskMessage
AgentTaskQueue ──1:N──→ TaskCheckpoint
AgentTaskQueue ──1:N──→ TaskReview
Run ──1:N──→ RunStep
Run ──1:N──→ RunTodo
Run ──1:N──→ RunArtifact
Run ──1:N──→ RunEvent
Run ──1:N──→ RunHandoff
Run ──1:1──→ RunContinuation
```

## Status Design Assessment

### Well-designed
- **Task state machine**: Explicit `allowedTransitions` map with `CanTransition()` gate — robust and testable
- **Runtime eligibility**: Clear checks for online + approved + not paused + not draining
- **Agent status reconciliation**: Automatic idle/working based on running task count

### Needs attention
- **Run phase transitions**: No validation — `AdvancePhase()` accepts any string. A `completed` run can be moved back to `pending`
- **Issue status**: No server-side state machine enforcement — client can set any valid CHECK value regardless of current state
- **Review status on task**: `none`, `pending`, `passed`, `failed` — only loosely coupled to the task state machine
- **Outbox**: Events are written but NoOpPublisher means the outbox table grows without bound and never delivers to external systems
