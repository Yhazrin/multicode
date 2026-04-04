package prompt

import (
	"context"
	"fmt"
)

// Priority constants for the 9-layer system prompt assembly.
// Lower = higher priority, assembled top-to-bottom.
const (
	PriorityBaseSystem     = 10
	PriorityMulticodeRole  = 20
	PriorityWorkspacePolicy = 30
	PriorityAgentProfile   = 40
	PriorityTaskObjective  = 50
	PrioritySkills         = 60
	PriorityTodo           = 70
	PriorityCheckpoint     = 80
	PriorityToolPolicy     = 90
)

// LayerContext carries all data needed to assemble the system prompt.
type LayerContext struct {
	// Base
	AppName    string
	AppVersion string

	// Workspace
	WorkspaceName    string
	WorkspaceRules   string // free-text workspace policy

	// Agent
	AgentName    string
	AgentRole    string
	AgentProfile string // free-text agent instructions

	// Task
	TaskTitle       string
	TaskDescription string
	IssueStatus     string

	// Skills
	SkillDescriptions []SkillInfo

	// Todos
	TodoItems []TodoInfo

	// Checkpoints
	LastCheckpoint string

	// Tools
	AllowedTools   []string
	RestrictedTools []string
}

// SkillInfo describes a skill available to the agent.
type SkillInfo struct {
	Name        string
	Description string
}

// TodoInfo describes a pending todo item.
type TodoInfo struct {
	Title       string
	Description string
	Status      string
}

// DefaultLayers returns the 9 standard layer definitions for prompt assembly.
func DefaultLayers() []LayerDef {
	return []LayerDef{
		{Name: "BaseSystem", Priority: PriorityBaseSystem, Assemble: assembleBaseSystem},
		{Name: "MulticodeRole", Priority: PriorityMulticodeRole, Assemble: assembleMulticodeRole},
		{Name: "WorkspacePolicy", Priority: PriorityWorkspacePolicy, Assemble: assembleWorkspacePolicy},
		{Name: "AgentProfile", Priority: PriorityAgentProfile, Assemble: assembleAgentProfile},
		{Name: "TaskObjective", Priority: PriorityTaskObjective, Assemble: assembleTaskObjective},
		{Name: "Skills", Priority: PrioritySkills, Assemble: assembleSkills},
		{Name: "Todo", Priority: PriorityTodo, Assemble: assembleTodo},
		{Name: "Checkpoint", Priority: PriorityCheckpoint, Assemble: assembleCheckpoint},
		{Name: "ToolPolicy", Priority: PriorityToolPolicy, Assemble: assembleToolPolicy},
	}
}

// AssemblePrompt builds a complete system prompt from the given LayerContext.
func AssemblePrompt(ctx context.Context, lctx *LayerContext) string {
	assembler := NewAssembler()
	for _, def := range DefaultLayers() {
		layerCtx := context.WithValue(ctx, layerCtxKey, lctx)
		layer := def.RegisteredLayer(layerCtx)
		assembler.Add(layer.Name, layer.Priority, layer.Content)
	}
	return assembler.Build()
}

type layerCtxKeyType struct{}

var layerCtxKey = layerCtxKeyType{}

// getLayerContext extracts LayerContext from context.
func getLayerContext(ctx context.Context) *LayerContext {
	if lctx, ok := ctx.Value(layerCtxKey).(*LayerContext); ok {
		return lctx
	}
	return &LayerContext{}
}

func assembleBaseSystem(ctx context.Context) (string, error) {
	lctx := getLayerContext(ctx)
	appName := lctx.AppName
	if appName == "" {
		appName = "Multicode"
	}
	version := lctx.AppVersion
	if version == "" {
		version = "dev"
	}
	return fmt.Sprintf("You are an AI assistant operating within %s (v%s). You have access to a workspace containing issues, code, and project artifacts. Always act professionally and follow the workspace policies.", appName, version), nil
}

func assembleMulticodeRole(ctx context.Context) (string, error) {
	lctx := getLayerContext(ctx)
	if lctx.AgentRole == "" {
		return "", nil
	}
	return fmt.Sprintf("Your role: %s", lctx.AgentRole), nil
}

func assembleWorkspacePolicy(ctx context.Context) (string, error) {
	lctx := getLayerContext(ctx)
	if lctx.WorkspaceRules == "" {
		return "", nil
	}
	return fmt.Sprintf("## Workspace Policy\n\n%s", lctx.WorkspaceRules), nil
}

func assembleAgentProfile(ctx context.Context) (string, error) {
	lctx := getLayerContext(ctx)
	if lctx.AgentProfile == "" {
		return "", nil
	}
	return fmt.Sprintf("## Agent Instructions\n\n%s", lctx.AgentProfile), nil
}

func assembleTaskObjective(ctx context.Context) (string, error) {
	lctx := getLayerContext(ctx)
	if lctx.TaskTitle == "" {
		return "", nil
	}
	var parts []string
	parts = append(parts, fmt.Sprintf("## Current Task: %s", lctx.TaskTitle))
	if lctx.TaskDescription != "" {
		parts = append(parts, lctx.TaskDescription)
	}
	if lctx.IssueStatus != "" {
		parts = append(parts, fmt.Sprintf("Status: %s", lctx.IssueStatus))
	}
	return joinNonEmpty(parts, "\n\n"), nil
}

func assembleSkills(ctx context.Context) (string, error) {
	lctx := getLayerContext(ctx)
	if len(lctx.SkillDescriptions) == 0 {
		return "", nil
	}
	var lines []string
	lines = append(lines, "## Available Skills")
	for _, s := range lctx.SkillDescriptions {
		lines = append(lines, fmt.Sprintf("- **%s**: %s", s.Name, s.Description))
	}
	return joinNonEmpty(lines, "\n"), nil
}

func assembleTodo(ctx context.Context) (string, error) {
	lctx := getLayerContext(ctx)
	if len(lctx.TodoItems) == 0 {
		return "", nil
	}
	var lines []string
	lines = append(lines, "## Current Todo List")
	for i, t := range lctx.TodoItems {
		marker := "[ ]"
		if t.Status == "completed" {
			marker = "[x]"
		} else if t.Status == "in_progress" {
			marker = "[>]"
		}
		item := fmt.Sprintf("%d. %s %s", i+1, marker, t.Title)
		if t.Description != "" {
			item += fmt.Sprintf(" — %s", t.Description)
		}
		lines = append(lines, item)
	}
	return joinNonEmpty(lines, "\n"), nil
}

func assembleCheckpoint(ctx context.Context) (string, error) {
	lctx := getLayerContext(ctx)
	if lctx.LastCheckpoint == "" {
		return "", nil
	}
	return fmt.Sprintf("## Last Checkpoint\n\n%s", lctx.LastCheckpoint), nil
}

func assembleToolPolicy(ctx context.Context) (string, error) {
	lctx := getLayerContext(ctx)
	if len(lctx.AllowedTools) == 0 && len(lctx.RestrictedTools) == 0 {
		return "", nil
	}
	var lines []string
	if len(lctx.AllowedTools) > 0 {
		lines = append(lines, "## Allowed Tools")
		for _, t := range lctx.AllowedTools {
			lines = append(lines, fmt.Sprintf("- %s", t))
		}
	}
	if len(lctx.RestrictedTools) > 0 {
		lines = append(lines, "## Restricted Tools")
		for _, t := range lctx.RestrictedTools {
			lines = append(lines, fmt.Sprintf("- %s (requires elevated permission)", t))
		}
	}
	return joinNonEmpty(lines, "\n"), nil
}

func joinNonEmpty(parts []string, sep string) string {
	var filtered []string
	for _, p := range parts {
		if p != "" {
			filtered = append(filtered, p)
		}
	}
	if len(filtered) == 0 {
		return ""
	}
	result := ""
	for i, p := range filtered {
		if i > 0 {
			result += sep
		}
		result += p
	}
	return result
}
