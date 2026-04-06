# MCP, Hook & Extension Flow

## MCP Server Integration

### Current Implementation State: **Partial — CRUD exists, execution integration is loose**

### Configuration Layer (Fully Implemented)
- **Database**: `mcp_servers` table (migration 042_mcp_servers) with workspace_id, name, type, config (JSON), status
- **Handler**: `handler/mcp_server.go` — full CRUD: List, Get, Create, Update, Delete, UpdateStatus
- **Routes**: `routes_mcp.go` — registered under `/api/workspaces/{workspaceID}/mcp-servers`
- **Frontend**: `app/(dashboard)/mcp/page.tsx` + `features/mcp/` — UI for managing MCP server configs

### Lifecycle Management (Partially Implemented)
- `mcp_lifecycle.go` in server startup: connects to all `active` MCP servers on boot
- `initMCPClientManager` creates connections based on DB config
- MCP client manager is passed to router/handler for tool registration
- `toolReg.OnChange` callback invalidates daemon's static prompt cache when tools change

### Agent Execution Integration (Loosely Coupled)
The connection between MCP tools and agent execution exists but is indirect:

1. **Tool registry**: MCP servers register their tools in a shared `ToolRegistry`
2. **Static registration**: On daemon register, handler calls `RegisterStaticToolsForDaemon` to include MCP tools
3. **Prompt injection**: Tool definitions appear in the agent's system prompt
4. **Actual MCP calls during execution**: The agent backend (Claude Code / Codex) handles MCP tool calls natively if the MCP server connection is configured in the CLI's environment

### What's Missing
- No verification that daemon has MCP server connectivity before task assignment
- No per-agent MCP tool filtering (all tools visible to all agents)
- No MCP tool usage tracking in run steps
- No error handling for MCP server disconnection during task execution

## Hooks

### Agent Lifecycle Hooks (Implemented in SDK)

**Location**: `pkg/agent/agent.go` — `LifecycleHooks` and `ToolHooks`

```go
type LifecycleHooks struct {
    OnSessionStart  func(session *Session) error
    OnSessionEnd    func(session *Session, result *Result) error
    OnError         func(session *Session, err error) error
}

type ToolHooks struct {
    BeforeToolCall  func(tool string, input map[string]any) (map[string]any, error)
    AfterToolCall   func(tool string, input map[string]any, output string) error
}
```

### Hook Usage in Daemon

**Location**: `daemon/hooks.go`

The daemon registers hooks during task execution:
1. **OnSessionStart**: Reports task as started, creates run
2. **OnSessionEnd**: Reports completion/failure, updates run
3. **BeforeToolCall**: Can modify tool inputs (e.g. inject workspace context)
4. **AfterToolCall**: Records tool usage for run steps

### Hook Extensibility
- Hooks are Go functions — not pluggable at runtime
- No webhook/HTTP callback mechanism for external hook providers
- No hook ordering or priority system
- Agent SDK hooks are hardcoded per-backend (Claude, Codex, OpenCode may handle differently)

## Extension Points

### Current Extension Mechanisms

1. **Skills**: User-defined instruction content attached to agents. Skills are injected into the system prompt as dynamic sections. Skill files provide supporting content (templates, examples). This is the primary user-facing extension mechanism.

2. **Agent Instructions**: Free-form text per agent. Injected as a dynamic prompt section after skill content. Lower abstraction than skills — no structure.

3. **Agent Tools JSON**: Per-agent tool configuration stored as JSON. Passed to the agent backend's `ToolPermissions`. Currently opaque — no UI for granular tool selection.

4. **Agent Triggers JSON**: Per-agent trigger configuration. Checked in `handler/issue.go` when issues are updated (e.g. auto-trigger on assignment). Structure:
   ```json
   {
     "on_assign": true,
     "on_mention": true,
     "on_status_change": ["in_progress"]
   }
   ```

5. **MCP Servers**: External tool providers (see above). The only runtime-extensible mechanism.

### What's NOT Extensible
- **Prompt assembly**: No plugin system for adding custom prompt sections from outside the Go codebase
- **Task lifecycle**: No webhook/event hooks for external systems to react to task state changes (outbox is NoOp)
- **Runtime selection**: Policy is configurable but the scoring algorithm is not pluggable
- **Review**: Review logic is internal — no external reviewer integration
- **Authentication**: No OAuth provider integration (only email + code). No SSO.

## Event Bus as Implicit Extension Point

`events/bus.go` provides a synchronous pub/sub bus:
- All domain events flow through it
- Listeners are registered at startup (`listeners.go`, `subscriber_listeners.go`, etc.)
- `Outbox` subscribes to all events and persists them
- **BUT**: `NoOpPublisher` means external delivery never happens

### If Outbox Publisher Were Implemented
The outbox pattern would enable:
- Webhook delivery to external systems
- Event-driven workflow triggers
- Cross-service event propagation
- Audit trail in external systems

This is the most impactful extension point waiting to be activated.

## Summary: Extension Maturity

| Mechanism | State | Usability |
|-----------|-------|-----------|
| Skills | **Working** | Users can create, edit, attach to agents |
| Agent Instructions | **Working** | Simple text, no structure |
| Agent Triggers | **Working** | JSON config, checked in issue handler |
| MCP Servers | **Partial** | Config CRUD works, execution integration loose |
| Lifecycle Hooks | **Internal only** | Go functions, not user-configurable |
| Tool Hooks | **Internal only** | Go functions, not user-configurable |
| Outbox/Webhooks | **Not implemented** | Outbox persists, publisher is NoOp |
| Custom Prompt Sections | **Not exposed** | Registry exists but no external API |
