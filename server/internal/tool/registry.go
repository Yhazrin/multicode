package tool

import (
	"fmt"
	"sync"
)

// PermissionLevel classifies tool risk.
type PermissionLevel int

const (
	PermissionRead     PermissionLevel = iota // safe reads
	PermissionWrite                            // file writes, edits
	PermissionDangerous                        // shell, delete, destructive
	PermissionNetwork                          // outbound HTTP
)

func (p PermissionLevel) String() string {
	switch p {
	case PermissionRead:
		return "read"
	case PermissionWrite:
		return "write"
	case PermissionDangerous:
		return "dangerous"
	case PermissionNetwork:
		return "network"
	default:
		return "unknown"
	}
}

// ToolDef describes a tool available to the agent runtime.
type ToolDef struct {
	Name        string
	Description string
	Permission  PermissionLevel
	// Schema is an optional JSON Schema describing the tool's input format.
	Schema []byte
}

// Registry is a thread-safe tool catalog.
type Registry struct {
	mu    sync.RWMutex
	tools map[string]ToolDef
}

// NewRegistry creates an empty tool registry.
func NewRegistry() *Registry {
	return &Registry{
		tools: make(map[string]ToolDef),
	}
}

// Register adds or replaces a tool definition.
func (r *Registry) Register(def ToolDef) error {
	if def.Name == "" {
		return fmt.Errorf("tool name must not be empty")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tools[def.Name] = def
	return nil
}

// Get retrieves a tool definition by name.
func (r *Registry) Get(name string) (ToolDef, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	def, ok := r.tools[name]
	return def, ok
}

// List returns all registered tool definitions.
func (r *Registry) List() []ToolDef {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]ToolDef, 0, len(r.tools))
	for _, def := range r.tools {
		result = append(result, def)
	}
	return result
}

// ListByPermission returns tools matching the given permission level.
func (r *Registry) ListByPermission(level PermissionLevel) []ToolDef {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []ToolDef
	for _, def := range r.tools {
		if def.Permission <= level {
			result = append(result, def)
		}
	}
	return result
}

// IsAllowed checks if a tool is available at the given permission ceiling.
func (r *Registry) IsAllowed(name string, maxLevel PermissionLevel) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	def, ok := r.tools[name]
	if !ok {
		return false
	}
	return def.Permission <= maxLevel
}

// Names returns all registered tool names.
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.tools))
	for name := range r.tools {
		names = append(names, name)
	}
	return names
}

// Count returns the number of registered tools.
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.tools)
}

// DefaultRegistry returns a registry pre-populated with standard tools.
func DefaultRegistry() *Registry {
	r := NewRegistry()
	tools := []ToolDef{
		{Name: "read_file", Description: "Read the contents of a file", Permission: PermissionRead},
		{Name: "list_files", Description: "List files in a directory", Permission: PermissionRead},
		{Name: "grep", Description: "Search file contents with regex", Permission: PermissionRead},
		{Name: "write_file", Description: "Write content to a file", Permission: PermissionWrite},
		{Name: "edit_file", Description: "Edit a file with search-and-replace", Permission: PermissionWrite},
		{Name: "shell_exec", Description: "Execute a shell command", Permission: PermissionDangerous},
		{Name: "delete_file", Description: "Delete a file", Permission: PermissionDangerous},
		{Name: "http_request", Description: "Make an HTTP request", Permission: PermissionNetwork},
	}
	for _, def := range tools {
		_ = r.Register(def) // all pre-populated names are non-empty
	}
	return r
}
