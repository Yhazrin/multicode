# Repo & Workspace Lifecycle

## Workspace

### Creation
- `POST /api/workspaces` → `handler/workspace.go: CreateWorkspace`
- Creates workspace with `issue_prefix`, `issue_counter=0`
- Creator automatically becomes `owner` member

### Hydration (Frontend)
`features/workspace/store.ts: hydrateWorkspace(workspace)`:
1. Sets active workspace in store
2. Saves `workspace_id` to localStorage
3. Calls `api.setWorkspaceId()` (sets header on ApiClient)
4. Parallel fetches: `listMembers`, `listAgents`, `listSkills`
5. Triggers `useIssueStore.fetch()` and `useInboxStore.fetch()`
6. All sub-fetches are resilient — failures produce toast but don't block

### Switching
`features/workspace/store.ts: switchWorkspace(workspace)`:
1. Calls `resetStores()` — clears issue, inbox, runtime stores
2. Calls `hydrateWorkspace(newWorkspace)` to re-fetch all data

### Multi-tenancy Enforcement
- All API queries filter by `workspace_id`
- `middleware.RequireWorkspaceMember` validates membership before handler execution
- `X-Workspace-ID` header routes requests (set by ApiClient)
- Frontend stores `workspace_id` in localStorage and syncs on boot

## Workspace Repos

### Data Model
`workspace_repo` table (migration 045):
- `workspace_id`, `name`, `clone_url`, `default_branch`, `provider` (github/gitlab/etc.)
- `issue.repo_id` FK → workspace_repo (nullable, SET NULL on delete)

### CRUD
- `handler/workspace_repo.go`: Full CRUD + `ListIssuesByRepoID`
- Frontend: repo picker in issue properties sidebar
- Migration 046 migrated legacy `workspace.repos` JSONB to new table

### Agent Execution Environment

**Location**: `daemon/execenv/` (execution environment package)

When a daemon executes a task:
1. Resolves the workspace repo from the issue's `repo_id`
2. Checks `daemon/repocache/` for existing clone
3. If not cached: clones the repo to a local directory
4. Creates a worktree for isolated execution (if supported)
5. Runs agent in the worktree directory

### Repo Cache
`daemon/repocache/`:
- Maintains local clones of workspace repos
- Keyed by (workspace_id, repo_name)
- Fetches updates before each task execution
- Cache cleanup TBD — no expiration mechanism

## Boundaries and Risks

### Workspace Isolation
- **Strong**: Database queries always include `workspace_id` WHERE clause
- **Strong**: WebSocket rooms are per-workspace — events don't leak
- **Moderate**: Runtime can serve multiple workspaces if registered in multiple (via join tokens)
- **Weak**: Daemon process runs in a single user context — filesystem access is shared across workspaces

### Repo Security
- **Risk**: Cloned repos persist on the daemon machine. No encryption at rest.
- **Risk**: Agent has full filesystem access (executor role). No sandbox.
- **Risk**: Worktree isolation depends on git, not OS-level separation.
- **Mitigation**: Reviewer role has `ReadOnly=true` and denied write tools.

### Workspace Deletion
- `DELETE /api/workspaces/{id}` cascades to most child tables (via `ON DELETE CASCADE`)
- **Risk**: Running daemon tasks may fail mid-execution if workspace is deleted
- **Risk**: Repo cache on daemon is not cleaned up when workspace is deleted

### Data Boundaries
- Issue prefix is workspace-scoped and immutable after creation
- Issue numbering uses workspace-level atomic counter (`IncrementIssueCounter`)
- Agents can only access issues in their workspace
- Cross-workspace operations: None supported (no federation)

## Current Limitations

1. **No repo branch management**: Tasks always execute on default branch. No branch-per-issue strategy.
2. **No repo access control**: Any agent in the workspace can access any repo. No per-agent repo restrictions.
3. **No repo webhook integration**: Changes pushed by agents are not detected automatically. No PR creation flow.
4. **Repo cache growth**: No cleanup mechanism for stale clones. Disk usage grows monotonically.
5. **Workspace member limits**: No enforcement of maximum members or agents per workspace.
