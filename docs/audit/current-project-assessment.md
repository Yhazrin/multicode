# Current Project Assessment

## What Has Been Solved

1. **Core issue-agent-task loop is functional end-to-end**: Issues can be created, assigned to agents, tasks are enqueued with runtime selection, daemons claim and execute tasks, results are posted as comments, agent status is reconciled. This is the product's backbone and it works.

2. **Real-time collaboration infrastructure**: WebSocket hub with per-workspace rooms, event bus with typed events, frontend WS sync layer with store integration. UI updates are immediate for most operations.

3. **Structured agent execution recording**: The Run/RunStep/RunTodo/RunArtifact/RunEvent system provides deep observability into agent work. Compaction prevents token budget exhaustion on long tasks.

4. **Runtime pool management**: Registration, heartbeat, sweeping, approval workflow, pause/drain modes, tags, join tokens, ping/update remote operations. The infrastructure for managing a fleet of daemon runtimes exists.

5. **Multi-modal authentication**: Email + verification code for humans, JWT for sessions, PAT for programmatic access, daemon tokens (defined but not wired), WS ticket for secure WebSocket upgrade.

## What Has NOT Been Solved

1. **External event publishing**: Outbox persists events but `NoOpPublisher` means no webhooks, no external integrations, no event-driven workflows outside the process boundary.

2. **Pagination at scale**: Frontend fetches 200 issues max. No cursor-based pagination, no infinite scroll, no server-side filtering for large workspaces.

3. **Search**: The search modal is declared in the type system and wired to keyboard shortcuts (`/`) and sidebar buttons, but has no implementation. No server-side search API exists.

4. **Goal decomposition UX**: Backend handler exists (`decompose.go`) but routes are not registered. Frontend has a `DecomposeDialog` component. The feature is an island — not connected to the routing layer.

5. **Fork orchestration UX**: Backend handler exists (`fork.go`) but routes are not registered. The daemon-side fork manager works, but the API endpoints for reporting fork lifecycle events are unreachable.

6. **MCP tool integration in agent execution**: MCP servers can be configured via CRUD API. The daemon has an MCP client manager. But the integration between MCP tools and agent execution is loosely coupled — no evidence of MCP tools appearing in agent tool lists during execution.

7. **Team task delegation**: Teams, team members, and team task queue tables exist. Routes are registered. But the team task delegation flow (assign issue to team → team lead distributes → individual agents execute) is partially implemented.

## Top 5 Strengths

1. **Task state machine rigor**: `task_state.go` with explicit `allowedTransitions` and `CanTransition()` gate prevents invalid task state changes. Every state transition in `task.go` checks this gate first.

2. **Runtime selection algorithm**: `runtime_selector.go` implements a sophisticated multi-factor scoring system: eligibility → tag matching → preference tiers → load scoring → queue depth filtering. This is production-grade scheduling logic.

3. **Prompt assembly architecture**: The `PromptRegistry` with static/dynamic sections, caching, and role-based composition (`system_prompt.go`) is well-designed for cache optimization and extensibility. The preview endpoints let users inspect what agents will actually see.

4. **Run observability**: RunOrchestrator + Coalescer + StepCoalescer + Compactor provide a comprehensive system for recording, optimizing, and reviewing agent execution. Events are persisted to DB before broadcast (at-least-once guarantee).

5. **Feature-based frontend architecture**: Clear separation of concerns with zustand stores per domain, WS event sync layer, and consistent patterns across features. Import alias conventions are well-defined.

## Top 5 Risks

1. **Migration 042 version conflict**: Two different migrations (issue_kind and mcp_servers) share version 042. This will cause `goose` to fail on fresh databases. Any new developer or CI from scratch will hit this immediately.

2. **Dead code creating false confidence**: `decompose.go`, `fork.go`, and `DaemonAuth` middleware exist as fully-implemented code but are not connected to the routing layer. Developers may assume these features work based on code review alone.

3. **Schema/generated code drift**: `agent_memory.sql` was deleted from queries but generated Go code still exists. The outbox table was added but has no cleanup mechanism. Running `make sqlc` will produce different results than what's committed.

4. **No run phase validation**: RunOrchestrator.AdvancePhase() accepts any phase string. A completed run can be set back to "pending". Unlike the task state machine, runs have no transition enforcement.

5. **Frontend search as false promise**: The keyboard shortcut `/` and sidebar search button trigger `useModalStore.open("search")` which sets state but renders nothing. Users will perceive this as a bug, not a missing feature.

## Highest Priority Investment Areas

1. **Fix migration 042 conflict** — Immediate blocker for any fresh environment setup
2. **Wire decompose/fork routes** — These features are 90% implemented; connecting them to routes is minimal effort for high feature value
3. **Implement search** — Core product usability for any workspace with >20 issues
4. **Add run phase validation** — Parity with task state machine rigor
5. **Clean up sqlc generated code** — Run `make sqlc` and commit the result to eliminate drift
