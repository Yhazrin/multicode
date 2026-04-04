package tool

import (
	"testing"
)

func TestRegistry_RegisterAndGet(t *testing.T) {
	r := NewRegistry()
	err := r.Register(ToolDef{
		Name:        "read_file",
		Description: "Read a file",
		Permission:  PermissionRead,
	})
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	def, ok := r.Get("read_file")
	if !ok {
		t.Fatal("Get() returned false")
	}
	if def.Description != "Read a file" {
		t.Errorf("Description = %q, want %q", def.Description, "Read a file")
	}
}

func TestRegistry_RegisterEmptyName(t *testing.T) {
	r := NewRegistry()
	err := r.Register(ToolDef{Name: ""})
	if err == nil {
		t.Error("expected error for empty name")
	}
}

func TestRegistry_ListByPermission(t *testing.T) {
	r := DefaultRegistry()

	// Read-only should get only read tools
	readTools := r.ListByPermission(PermissionRead)
	for _, def := range readTools {
		if def.Permission > PermissionRead {
			t.Errorf("tool %s has permission %v, expected <= read", def.Name, def.Permission)
		}
	}

	// Dangerous should get read + write + dangerous
	dangerous := r.ListByPermission(PermissionDangerous)
	if len(dangerous) < len(readTools) {
		t.Error("dangerous permission should include more tools than read-only")
	}
}

func TestRegistry_IsAllowed(t *testing.T) {
	r := DefaultRegistry()

	if !r.IsAllowed("read_file", PermissionRead) {
		t.Error("read_file should be allowed at read level")
	}
	if r.IsAllowed("shell_exec", PermissionRead) {
		t.Error("shell_exec should NOT be allowed at read level")
	}
	if !r.IsAllowed("shell_exec", PermissionDangerous) {
		t.Error("shell_exec should be allowed at dangerous level")
	}
	if r.IsAllowed("nonexistent", PermissionDangerous) {
		t.Error("nonexistent tool should not be allowed")
	}
}

func TestRegistry_Count(t *testing.T) {
	r := DefaultRegistry()
	if r.Count() != 8 {
		t.Errorf("Count() = %d, want 8", r.Count())
	}
}

func TestRegistry_Names(t *testing.T) {
	r := DefaultRegistry()
	names := r.Names()
	if len(names) != 8 {
		t.Errorf("Names() returned %d names, want 8", len(names))
	}
}
