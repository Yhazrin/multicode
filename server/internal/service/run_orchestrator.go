package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multicode/server/internal/events"
	"github.com/multica-ai/multicode/server/internal/realtime"
	"github.com/multica-ai/multicode/server/internal/util"
	db "github.com/multica-ai/multicode/server/pkg/db/generated"
	"github.com/multica-ai/multicode/server/pkg/protocol"
)

// Run phases — the lifecycle a run progresses through.
const (
	PhasePending    = "pending"
	PhasePlanning   = "planning"
	PhaseExecuting  = "executing"
	PhaseReviewing  = "reviewing"
	PhaseCompleted  = "completed"
	PhaseFailed     = "failed"
	PhaseCancelled  = "cancelled"
)

// RunOrchestrator manages the lifecycle of agent runs: creation, phase
// transitions, step/todo recording, compaction, handoffs, and completion.
type RunOrchestrator struct {
	Queries   *db.Queries
	Compactor *Compactor
	Hub       *realtime.Hub
	Bus       *events.Bus
}

// NewRunOrchestrator creates a new RunOrchestrator.
func NewRunOrchestrator(queries *db.Queries, compactor *Compactor, hub *realtime.Hub, bus *events.Bus) *RunOrchestrator {
	return &RunOrchestrator{
		Queries:   queries,
		Compactor: compactor,
		Hub:       hub,
		Bus:       bus,
	}
}

// CreateRunRequest contains the parameters for creating a new run.
type CreateRunRequest struct {
	WorkspaceID    string
	IssueID        string
	AgentID        string
	TaskID         string
	ParentRunID    string
	TeamID         string
	SystemPrompt   string
	ModelName      string
	PermissionMode string
}

// CreateRun creates a new run in the pending phase and broadcasts run:created.
func (o *RunOrchestrator) CreateRun(ctx context.Context, req CreateRunRequest) (db.Run, error) {
	params := db.CreateRunParams{
		WorkspaceID:    util.ParseUUID(req.WorkspaceID),
		IssueID:        util.ParseUUID(req.IssueID),
		AgentID:        util.ParseUUID(req.AgentID),
		Phase:          PhasePending,
		Status:         "pending",
		SystemPrompt:   req.SystemPrompt,
		ModelName:      req.ModelName,
		PermissionMode: req.PermissionMode,
		TaskID:         parseNullUUID(req.TaskID),
		ParentRunID:    parseNullUUID(req.ParentRunID),
		TeamID:         parseNullUUID(req.TeamID),
	}

	run, err := o.Queries.CreateRun(ctx, params)
	if err != nil {
		return db.Run{}, fmt.Errorf("create run: %w", err)
	}

	o.broadcast(protocol.EventRunCreated, run)
	slog.Info("run created",
		"run_id", util.UUIDToString(run.ID),
		"issue_id", req.IssueID,
		"agent_id", req.AgentID,
	)

	return run, nil
}

// StartRun transitions a run from pending to active/executing and broadcasts run:started.
func (o *RunOrchestrator) StartRun(ctx context.Context, runID string) (db.Run, error) {
	run, err := o.Queries.StartRun(ctx, util.ParseUUID(runID))
	if err != nil {
		return db.Run{}, fmt.Errorf("start run: %w", err)
	}

	o.broadcast(protocol.EventRunStarted, run)
	slog.Info("run started", "run_id", runID)

	return run, nil
}

// AdvancePhase moves the run to a new phase and broadcasts run:phase_changed.
func (o *RunOrchestrator) AdvancePhase(ctx context.Context, runID string, newPhase string) (db.Run, error) {
	run, err := o.Queries.UpdateRunPhase(ctx, db.UpdateRunPhaseParams{
		ID:    util.ParseUUID(runID),
		Phase: newPhase,
	})
	if err != nil {
		return db.Run{}, fmt.Errorf("advance phase: %w", err)
	}

	o.broadcast(protocol.EventRunPhaseChanged, run, map[string]any{
		"phase": newPhase,
	})
	slog.Info("run phase changed",
		"run_id", runID,
		"phase", newPhase,
	)

	return run, nil
}

// RecordStep records a tool invocation step within a run.
// If toolOutput is empty, the step is started (in-progress). If toolOutput is
// provided, the step is completed immediately.
func (o *RunOrchestrator) RecordStep(ctx context.Context, runID string, toolName string, toolInput []byte, toolOutput string, isError bool) (db.RunStep, error) {
	seq, err := o.Queries.GetNextStepSeq(ctx, util.ParseUUID(runID))
	if err != nil {
		return db.RunStep{}, fmt.Errorf("get next step seq: %w", err)
	}

	var outputVal pgtype.Text
	if toolOutput != "" {
		outputVal = util.StrToText(toolOutput)
	}

	step, err := o.Queries.CreateRunStep(ctx, db.CreateRunStepParams{
		RunID:      util.ParseUUID(runID),
		Seq:        seq,
		ToolName:   toolName,
		ToolInput:  toolInput,
		ToolOutput: outputVal,
		IsError:    isError,
		StartedAt:  pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return db.RunStep{}, fmt.Errorf("create run step: %w", err)
	}

	eventType := protocol.EventRunStepStarted
	if toolOutput != "" {
		eventType = protocol.EventRunStepCompleted
	}

	o.broadcast(eventType, db.Run{ID: util.ParseUUID(runID), WorkspaceID: util.ParseUUID("")}, map[string]any{
		"step_id":   util.UUIDToString(step.ID),
		"run_id":    runID,
		"seq":       seq,
		"tool_name": toolName,
		"is_error":  isError,
	})

	return step, nil
}

// CompleteStep marks an existing step as completed with output.
func (o *RunOrchestrator) CompleteStep(ctx context.Context, stepID string, toolOutput string, isError bool) (db.RunStep, error) {
	step, err := o.Queries.CompleteRunStep(ctx, db.CompleteRunStepParams{
		ID:         util.ParseUUID(stepID),
		ToolOutput: util.StrToText(toolOutput),
		IsError:    isError,
	})
	if err != nil {
		return db.RunStep{}, fmt.Errorf("complete step: %w", err)
	}

	o.broadcast(protocol.EventRunStepCompleted, db.Run{ID: step.RunID}, map[string]any{
		"step_id":   stepID,
		"run_id":    util.UUIDToString(step.RunID),
		"tool_name": step.ToolName,
		"is_error":  isError,
	})

	return step, nil
}

// CreateTodo creates a new todo item for a run and broadcasts run:todo_created.
func (o *RunOrchestrator) CreateTodo(ctx context.Context, runID string, title string, description string) (db.RunTodo, error) {
	seq, err := o.Queries.GetNextTodoSeq(ctx, util.ParseUUID(runID))
	if err != nil {
		return db.RunTodo{}, fmt.Errorf("get next todo seq: %w", err)
	}

	todo, err := o.Queries.CreateRunTodo(ctx, db.CreateRunTodoParams{
		RunID:       util.ParseUUID(runID),
		Seq:         seq,
		Title:       title,
		Description: description,
		Status:      "pending",
	})
	if err != nil {
		return db.RunTodo{}, fmt.Errorf("create run todo: %w", err)
	}

	o.broadcast(protocol.EventRunTodoCreated, db.Run{ID: util.ParseUUID(runID)}, map[string]any{
		"todo_id": util.UUIDToString(todo.ID),
		"run_id":  runID,
		"seq":     seq,
		"title":   title,
		"status":  "pending",
	})

	return todo, nil
}

// UpdateTodo updates a todo's status and broadcasts run:todo_updated.
func (o *RunOrchestrator) UpdateTodo(ctx context.Context, todoID string, status string, blocker string) (db.RunTodo, error) {
	var statusVal pgtype.Text
	if status != "" {
		statusVal = util.StrToText(status)
	}

	var blockerVal pgtype.Text
	if blocker != "" {
		blockerVal = util.StrToText(blocker)
	}

	todo, err := o.Queries.UpdateRunTodo(ctx, db.UpdateRunTodoParams{
		ID:      util.ParseUUID(todoID),
		Status:  statusVal,
		Blocker: blockerVal,
	})
	if err != nil {
		return db.RunTodo{}, fmt.Errorf("update run todo: %w", err)
	}

	o.broadcast(protocol.EventRunTodoUpdated, db.Run{ID: todo.RunID}, map[string]any{
		"todo_id": todoID,
		"run_id":  util.UUIDToString(todo.RunID),
		"status":  status,
		"blocker": blocker,
	})

	return todo, nil
}

// CompleteRun marks a run as completed and broadcasts run:completed.
func (o *RunOrchestrator) CompleteRun(ctx context.Context, runID string) (db.Run, error) {
	run, err := o.Queries.CompleteRun(ctx, util.ParseUUID(runID))
	if err != nil {
		return db.Run{}, fmt.Errorf("complete run: %w", err)
	}

	o.broadcast(protocol.EventRunCompleted, run)
	slog.Info("run completed", "run_id", runID)

	return run, nil
}

// FailRun marks a run as failed and broadcasts run:failed.
func (o *RunOrchestrator) FailRun(ctx context.Context, runID string) (db.Run, error) {
	run, err := o.Queries.FailRun(ctx, util.ParseUUID(runID))
	if err != nil {
		return db.Run{}, fmt.Errorf("fail run: %w", err)
	}

	o.broadcast(protocol.EventRunFailed, run)
	slog.Info("run failed", "run_id", runID)

	return run, nil
}

// CancelRun marks a run as cancelled and broadcasts run:cancelled.
func (o *RunOrchestrator) CancelRun(ctx context.Context, runID string) (db.Run, error) {
	run, err := o.Queries.CancelRun(ctx, util.ParseUUID(runID))
	if err != nil {
		return db.Run{}, fmt.Errorf("cancel run: %w", err)
	}

	o.broadcast(protocol.EventRunCancelled, run)
	slog.Info("run cancelled", "run_id", runID)

	return run, nil
}

// UpdateTokens increments the token counters on a run.
func (o *RunOrchestrator) UpdateTokens(ctx context.Context, runID string, inputTokens, outputTokens int64, cost float64) error {
	var costVal pgtype.Numeric
	if err := costVal.Scan(fmt.Sprintf("%.6f", cost)); err != nil {
		return fmt.Errorf("scan cost: %w", err)
	}

	_, err := o.Queries.UpdateRunTokens(ctx, db.UpdateRunTokensParams{
		ID:               util.ParseUUID(runID),
		InputTokens:      inputTokens,
		OutputTokens:     outputTokens,
		EstimatedCostUsd: costVal,
	})
	if err != nil {
		return fmt.Errorf("update tokens: %w", err)
	}
	return nil
}

// CreateHandoff records a handoff from one run to another (or to a team/agent).
func (o *RunOrchestrator) CreateHandoff(ctx context.Context, sourceRunID string, handoffType string, reason string, targetRunID string, targetTeamID string, targetAgentID string, contextPacket []byte) (db.RunHandoff, error) {
	handoff, err := o.Queries.CreateRunHandoff(ctx, db.CreateRunHandoffParams{
		SourceRunID:   util.ParseUUID(sourceRunID),
		HandoffType:   handoffType,
		Reason:        reason,
		TargetRunID:   parseNullUUID(targetRunID),
		TargetTeamID:  parseNullUUID(targetTeamID),
		TargetAgentID: parseNullUUID(targetAgentID),
		ContextPacket: contextPacket,
	})
	if err != nil {
		return db.RunHandoff{}, fmt.Errorf("create handoff: %w", err)
	}

	slog.Info("run handoff created",
		"source_run_id", sourceRunID,
		"type", handoffType,
		"target_run_id", targetRunID,
	)

	return handoff, nil
}

// CreateContinuation saves a continuation packet for a run, enabling
// structured resumption in a future run.
func (o *RunOrchestrator) CreateContinuation(ctx context.Context, runID string, summary string, pendingTodos, keyDecisions, changedFiles, blockers, openQuestions json.RawMessage, tokenBudgetUsed int64) (db.RunContinuation, error) {
	cont, err := o.Queries.CreateRunContinuation(ctx, db.CreateRunContinuationParams{
		RunID:           util.ParseUUID(runID),
		CompactSummary:  summary,
		PendingTodos:    pendingTodos,
		KeyDecisions:    keyDecisions,
		ChangedFiles:    changedFiles,
		Blockers:        blockers,
		OpenQuestions:   openQuestions,
		TokenBudgetUsed: tokenBudgetUsed,
	})
	if err != nil {
		return db.RunContinuation{}, fmt.Errorf("create continuation: %w", err)
	}

	slog.Info("run continuation saved",
		"run_id", runID,
		"token_budget_used", tokenBudgetUsed,
	)

	return cont, nil
}

// CreateArtifact stores an artifact (file output, report, etc.) produced during a run.
func (o *RunOrchestrator) CreateArtifact(ctx context.Context, runID string, stepID string, artifactType string, name string, content string, mimeType string) (db.RunArtifact, error) {
	artifact, err := o.Queries.CreateRunArtifact(ctx, db.CreateRunArtifactParams{
		RunID:        util.ParseUUID(runID),
		StepID:       parseNullUUID(stepID),
		ArtifactType: artifactType,
		Name:         name,
		Content:      content,
		MimeType:     mimeType,
	})
	if err != nil {
		return db.RunArtifact{}, fmt.Errorf("create artifact: %w", err)
	}

	return artifact, nil
}

// ListRuns returns runs for a workspace with pagination.
func (o *RunOrchestrator) ListRuns(ctx context.Context, workspaceID string, limit, offset int32) ([]db.Run, error) {
	return o.Queries.ListRunsByWorkspace(ctx, db.ListRunsByWorkspaceParams{
		WorkspaceID: util.ParseUUID(workspaceID),
		Limit:       limit,
		Offset:      offset,
	})
}

// ListRunsByIssue returns all runs for a given issue.
func (o *RunOrchestrator) ListRunsByIssue(ctx context.Context, issueID string) ([]db.Run, error) {
	return o.Queries.ListRunsByIssue(ctx, util.ParseUUID(issueID))
}

// GetRun returns a single run by ID.
func (o *RunOrchestrator) GetRun(ctx context.Context, runID string) (db.Run, error) {
	return o.Queries.GetRun(ctx, util.ParseUUID(runID))
}

// GetRunSteps returns all steps for a run.
func (o *RunOrchestrator) GetRunSteps(ctx context.Context, runID string) ([]db.RunStep, error) {
	return o.Queries.ListRunSteps(ctx, util.ParseUUID(runID))
}

// GetRunTodos returns all todos for a run.
func (o *RunOrchestrator) GetRunTodos(ctx context.Context, runID string) ([]db.RunTodo, error) {
	return o.Queries.ListRunTodos(ctx, util.ParseUUID(runID))
}

// GetRunArtifacts returns all artifacts for a run.
func (o *RunOrchestrator) GetRunArtifacts(ctx context.Context, runID string) ([]db.RunArtifact, error) {
	return o.Queries.ListRunArtifacts(ctx, util.ParseUUID(runID))
}

// broadcast sends a run event through the event bus with the run's workspace ID.
func (o *RunOrchestrator) broadcast(eventType string, run db.Run, extra ...map[string]any) {
	payload := map[string]any{
		"run_id": util.UUIDToString(run.ID),
		"phase":  run.Phase,
		"status": run.Status,
	}
	if run.AgentID.Valid {
		payload["agent_id"] = util.UUIDToString(run.AgentID)
	}
	if run.IssueID.Valid {
		payload["issue_id"] = util.UUIDToString(run.IssueID)
	}
	if run.TaskID.Valid {
		payload["task_id"] = util.UUIDToString(run.TaskID)
	}

	for _, ex := range extra {
		for k, v := range ex {
			payload[k] = v
		}
	}

	o.Bus.PublishAsync(events.Event{
		Type:        eventType,
		WorkspaceID: util.UUIDToString(run.WorkspaceID),
		ActorType:   "system",
		ActorID:     "",
		Payload:     payload,
	})
}

// parseNullUUID returns a null UUID if s is empty, otherwise parses it.
func parseNullUUID(s string) pgtype.UUID {
	if s == "" {
		return pgtype.UUID{}
	}
	return util.ParseUUID(s)
}
