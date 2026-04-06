# Prompt & Context Assembly

## Architecture

Prompt assembly uses a **registry pattern** with static/dynamic boundary, inspired by Claude Code's prompt caching optimization.

**Location**: `server/internal/daemon/system_prompt.go`

## PromptRegistry

```
PromptRegistry
├── sections[]  — ordered list of PromptSection
├── staticCache — persistent across Resolve() calls
├── cache       — per-cycle (dynamic sections)
└── dirty       — marks when sections change
```

Each `PromptSection` has:
- `Name`: unique identifier
- `Phase`: `PhaseStatic` (rarely changes) or `PhaseDynamic` (per-task)
- `Order`: sort key (lower = earlier)
- `Compute`: lazy content generator function

## Assembly Priority Chain

```
1. OverridePrompt → replaces everything (emergency override)
2. Registry-based assembly:
   [STATIC sections, sorted by Order]
   ──── BOUNDARY ────
   [DYNAMIC sections, sorted by Order]
3. AppendPrompt → always added at end
```

## Default Sections

### Static Sections (cached across tasks)

| Order | Name | Content |
|-------|------|---------|
| 10 | `identity` | Agent name, platform identity, multi-agent collaboration context |
| 20 | `core-rules` | 6 rules: understand before acting, be precise, verify, communicate, respect deps, persist context |
| 30 | `execution-protocol` | 4-phase lifecycle: Research → Plan → Implement → Verify. CLI commands for each phase |
| 40 | `tool-guidance` | Read first/write second, batch operations, bash for tests only |
| 50 | `collaboration-protocol` | Agent messaging, task chaining, checkpoints, memory recall |

### Dynamic Sections (per-task)

| Order | Name | Content |
|-------|------|---------|
| 5 | `custom-prompt` | If CustomPrompt set, replaces identity+rules (but keeps protocol) |
| 10 | `agent-instructions` | Agent's user-configured instructions |
| 15 | `coordinator-fork-guidance` | Only for coordinator role — fork delegation patterns |

## Per-Task Prompt Building

**Location**: `server/internal/daemon/prompt.go`

When the daemon executes a task, it builds the full prompt:

1. Creates a `SystemPromptConfig` from agent and workspace data
2. Creates a new `PromptRegistry` (or uses shared registry for preview)
3. Registers default sections
4. Registers additional dynamic sections:
   - **Skill instructions**: Agent's attached skills injected as sections
   - **Task context**: Issue details, comment thread, repo info
   - **Collaboration context**: Active collaborators, their roles, recent messages
   - **Memory**: Relevant agent memories recalled via pgvector similarity
5. Calls `registry.Resolve()` to assemble
6. Appends any `AppendPrompt`

## Role-Based Tool Permissions

`DefaultToolPermissions(role)` returns:

| Role | Allowed | Denied | ReadOnly |
|------|---------|--------|----------|
| `executor` (default) | all | none | false |
| `coordinator` | Bash, Read, Grep, Glob, Agent, SendMessage | Edit, Write, NotebookEdit | false |
| `reviewer` | Read, Grep, Glob | Edit, Write, NotebookEdit, Bash | true |

## Preview Endpoints

The prompt can be previewed before execution:

- `GET /api/agents/{id}/prompt-preview` — shows full assembled prompt with section breakdown
- `GET /api/agents/{id}/task-context?issue_id=...` — shows what context would be injected for a specific issue

These use `RegisterDefaultSectionsForPreview()` and `ExportSections()` to provide section-level visibility.

## Cache Optimization

Static sections (identity, rules, protocol) are cached in `staticCache` and survive across `Resolve()` calls. This means:
- First task execution computes all sections
- Subsequent tasks only recompute dynamic sections
- `InvalidateStatic()` is called when tool definitions change (via `toolRegistry.OnChange`)
- `InvalidateSection(name)` can target specific sections

## Shared Registry

A process-wide `sharedRegistry` singleton exists for daemon-wide section management. External callers (e.g. tool registry change handlers) can call `SharedRegistry().InvalidateStatic()` to force recomputation.

## Current Limitations

1. **No memory integration in default sections**: Agent memory recall is done at the daemon level but not as a registered prompt section — it's concatenated separately
2. **No issue context in default sections**: Issue details are injected by the daemon's `prompt.go`, not through the registry. This means preview endpoints don't show full task context by default
3. **Custom prompt replaces identity but keeps protocol**: This may be confusing — users setting a custom prompt still get execution protocol injected
4. **No token budget enforcement in assembly**: The assembled prompt can exceed the model's context window. Compaction only kicks in during execution, not during assembly
