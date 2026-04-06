# High Priority Issues

## P0: Critical — Fix Immediately

### P0-1: Migration 042 Version Conflict

**Impact**: Fresh database setup fails. CI from-scratch environments break. New developer onboarding blocked.

**Trigger**: Running `make migrate-up` or `goose up` on a fresh database.

**Location**: `server/migrations/042_issue_kind.{up,down}.sql` and `server/migrations/042_mcp_servers.{up,down}.sql`

**Risk**: goose treats migration versions as unique. Two different migrations sharing version 042 causes an error during migration parsing. The custom `buildMigrations` in `cmd/migrate/main.go` may or may not handle this — but it's fragile and non-standard.

**Fix**: Renumber `042_mcp_servers` to `043_mcp_servers` and renumber all subsequent migrations (043→044, 044→045, etc.). Alternatively, merge the two 042 migrations into one. The latter is cleaner if the schemas don't conflict.

**Recommended**: Fix in this session — renumber the mcp_servers migration.

---

### P0-2: Generated Code / Query File Drift (agent_memory)

**Impact**: `make sqlc` will produce different output than what's committed. Build may reference queries that no longer have SQL source files.

**Trigger**: Running `make sqlc` regenerates code, potentially breaking compilation or removing expected query methods.

**Location**:
- `server/pkg/db/queries/agent_memory.sql` — **DELETED** (git status shows `D`)
- `server/pkg/db/generated/agent_memory.sql.go` — **STILL EXISTS**

**Risk**: The generated code references queries that no longer have source SQL. If any handler imports these query methods, compilation will fail after `make sqlc`. If no handler uses them, the generated code is dead weight that will confuse future developers.

**Fix**: Run `make sqlc` to regenerate. If compilation breaks, update handlers. If not, commit the regenerated code.

**Recommended**: Fix in this session.

---

## P1: High Priority — Fix Soon

### P1-1: Decompose & Fork Handlers Not Routed

**Impact**: Two fully implemented features (goal decomposition, fork lifecycle) are unreachable via HTTP. Frontend components that depend on these APIs will fail silently.

**Trigger**: Any attempt to use decompose or fork features from frontend or daemon.

**Location**:
- `server/internal/handler/decompose.go` — Decompose, GetDecomposeResult, ConfirmDecompose
- `server/internal/handler/fork.go` — DaemonForkStarted, DaemonForkCompleted, DaemonForkFailed
- `server/cmd/server/routes_*.go` — **NO** registration for either handler group

**Risk**: Dead code that looks functional. Developers may build on top of these handlers assuming they work, but they're never called.

**Fix**: Add route registrations in `routes_issue.go` (for decompose) and `routes_daemon.go` (for fork). Routes per handler comments:
- `POST /api/issues/{id}/decompose` → `h.Decompose`
- `GET /api/issues/{id}/decompose/{runId}` → `h.GetDecomposeResult`
- `POST /api/issues/{id}/decompose/confirm` → `h.ConfirmDecompose`
- `POST /api/daemon/tasks/{taskId}/forks/{forkId}/start` → `h.DaemonForkStarted`
- `POST /api/daemon/tasks/{taskId}/forks/{forkId}/complete` → `h.DaemonForkCompleted`
- `POST /api/daemon/tasks/{taskId}/forks/{forkId}/fail` → `h.DaemonForkFailed`

**Recommended**: Fix in this session.

---

### P1-2: Search Modal Not Implemented

**Impact**: Keyboard shortcut `/` and sidebar search button open a modal that renders nothing. User-facing bug.

**Trigger**: Press `/` on any dashboard page, or click the search button in sidebar.

**Location**:
- `apps/web/features/modals/store.ts` — ModalType includes `"search"`
- `apps/web/features/modals/registry.tsx` — No case for `"search"` in switch
- `apps/web/app/(dashboard)/_components/app-sidebar.tsx` — Opens search modal
- `apps/web/app/(dashboard)/_components/keyboard-shortcuts.tsx` — `/` opens search modal

**Risk**: Users will perceive this as a broken feature. The modal state is set but nothing renders, then the user must click elsewhere to dismiss an invisible modal.

**Fix (minimal)**: Remove `"search"` from ModalType and remove the search button/shortcut triggers. OR implement a basic search dialog with client-side issue filtering.

**Recommended**: Fix in this session — remove the broken trigger and add a TODO comment.

---

### P1-3: DaemonAuth Middleware Defined But Unused

**Impact**: Daemon authentication uses the same JWT/PAT path as regular users, missing the dedicated `mdt_` token validation. No functional impact now (daemons use PAT), but the designed auth model is not implemented.

**Trigger**: N/A (no immediate user impact, but auth model inconsistency).

**Location**:
- `server/internal/middleware/daemon_auth.go` — `DaemonAuth` function defined
- `server/cmd/server/routes_daemon.go` — Uses `middleware.Auth` instead

**Risk**: If daemon tokens (`mdt_` prefix) are generated and used, they'll be validated through PAT/JWT path which may not handle them correctly. The DaemonAuth middleware has different context keys (`DaemonWorkspaceIDFromContext`, `DaemonIDFromContext`) that handlers might rely on.

**Fix**: Either wire `DaemonAuth` into daemon routes, or remove the middleware and simplify the auth model to PAT-only for daemons.

**Recommended**: Document the inconsistency; defer the fix as it requires auth model decision.

---

### P1-4: No Run Phase Transition Validation

**Impact**: Runs can transition to any phase from any phase. A completed run can be moved back to "pending". No state machine enforcement.

**Trigger**: Any call to `RunOrchestrator.AdvancePhase()` with an invalid phase transition.

**Location**: `server/internal/service/run_orchestrator.go: AdvancePhase()`

**Risk**: Unlike the task state machine (which has `CanTransition()`), runs have no guardrails. This can lead to inconsistent run state visible in the UI.

**Fix**: Add a `runAllowedTransitions` map similar to `task_state.go` and validate in `AdvancePhase()`.

**Recommended**: Fix in this session.

---

## P2: Structural Improvements

### P2-1: Issue List 200-Item Cap

**Impact**: Workspaces with >200 issues show incomplete data. Users cannot see or filter older issues.

**Location**: `apps/web/features/issues/stores/store.ts` — `api.listIssues({ limit: 200 })`

**Fix**: Implement cursor-based pagination with infinite scroll, or increase limit with server-side filtering.

**Recommended**: Defer — requires both API and frontend changes.

---

### P2-2: Outbox NoOpPublisher

**Impact**: `outbox` table grows unboundedly. No external event delivery.

**Location**:
- `server/internal/events/outbox.go` — `NoOpPublisher`
- `server/cmd/server/main.go` — `outbox.NewWorker(outboxRepo, events.NoOpPublisher)`

**Fix**: Implement a real publisher (webhook, message queue) or add cleanup for processed outbox rows.

**Recommended**: Defer — architectural decision needed.

---

### P2-3: Embedded Migration Copy

**Impact**: Two copies of migrations exist: `server/migrations/` (canonical) and `server/pkg/migrations/migrations/` (embedded). They must be kept in sync manually.

**Location**: Both directories under `server/`

**Fix**: Use Go embed directive to reference `server/migrations/` directly from the migrate binary, eliminating the copy.

**Recommended**: Defer — requires build config change.

---

### P2-4: Frontend Dual API Pattern

**Impact**: Two parallel API patterns (`ApiClient` methods vs domain modules like `authApi`, `issuesApi`) increase cognitive overhead and risk workspace ID desync.

**Location**:
- `apps/web/shared/api/client.ts` — monolithic ApiClient
- `apps/web/shared/api/auth.ts`, `issues.ts`, etc. — separate fetch wrappers

**Fix**: Converge on one pattern. The domain modules are thinner and easier to test; ApiClient is more mature.

**Recommended**: Defer — large refactor with low risk.

---

## P3: Can Defer

### P3-1: No E2E Coverage for Daemon Full Loop

**Impact**: The core daemon claim→execute→complete loop is not tested end-to-end in CI.

**Location**: `e2e/` — no daemon-related specs

**Fix**: Add E2E test that registers a mock daemon, creates an issue, assigns an agent, and verifies task completion.

---

### P3-2: WebSocket Connection Status Not Shown

**Impact**: Users cannot tell if their real-time connection is active. Stale data may be shown without indication.

**Location**: `apps/web/features/realtime/provider.tsx` — `connectionState` tracked but not exposed to UI

**Fix**: Add a connection indicator component (e.g. colored dot in header).

---

### P3-3: No Agent Memory Query Cleanup

**Impact**: `agent_memory` records with pgvector embeddings grow without bound.

**Location**: `server/cmd/server/memory_sweeper.go` — sweeper exists but may not cover all cases

**Fix**: Implement TTL-based cleanup and embedding index maintenance.

---

### P3-4: Missing Error Boundaries in Feature Components

**Impact**: Unhandled errors in feature components can crash the entire dashboard.

**Location**: Most feature components lack try/catch or ErrorBoundary wrappers

**Fix**: Add React Error Boundaries around major feature sections.
