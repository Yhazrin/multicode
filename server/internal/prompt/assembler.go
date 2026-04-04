package prompt

import (
	"context"
	"strings"
)

// Layer represents a single contribution to the system prompt.
type Layer struct {
	Name     string
	Priority int    // lower = higher priority, assembled top-to-bottom
	Content  string
}

// Assembler builds a system prompt by composing ordered layers.
type Assembler struct {
	layers []Layer
}

// NewAssembler creates an empty prompt assembler.
func NewAssembler() *Assembler {
	return &Assembler{}
}

// Add appends a layer. Callers should add in priority order.
func (a *Assembler) Add(name string, priority int, content string) {
	a.layers = append(a.layers, Layer{Name: name, Priority: priority, Content: content})
}

// Build concatenates all non-empty layers into a single system prompt,
// separated by blank lines. Layers are sorted by priority (ascending).
func (a *Assembler) Build() string {
	// Sort by priority
	sorted := make([]Layer, len(a.layers))
	copy(sorted, a.layers)
	sortLayers(sorted)

	var parts []string
	for _, l := range sorted {
		content := strings.TrimSpace(l.Content)
		if content == "" {
			continue
		}
		parts = append(parts, content)
	}
	return strings.Join(parts, "\n\n")
}

// LayerCount returns the number of non-empty layers in the last Build().
func (a *Assembler) LayerCount() int {
	count := 0
	for _, l := range a.layers {
		if strings.TrimSpace(l.Content) != "" {
			count++
		}
	}
	return count
}

func sortLayers(layers []Layer) {
	for i := 1; i < len(layers); i++ {
		for j := i; j > 0 && layers[j].Priority < layers[j-1].Priority; j-- {
			layers[j], layers[j-1] = layers[j-1], layers[j]
		}
	}
}

// AssembleFunc is a function that produces a layer's content given a context.
type AssembleFunc func(ctx context.Context) (string, error)

// LayerDef defines a named layer with its priority and assembly function.
type LayerDef struct {
	Name     string
	Priority int
	Assemble AssembleFunc
}

// RegisteredLayer returns a Layer after executing its Assemble function.
func (d LayerDef) RegisteredLayer(ctx context.Context) Layer {
	content, err := d.Assemble(ctx)
	if err != nil {
		content = "" // skip errored layers silently — caller should log
	}
	return Layer{Name: d.Name, Priority: d.Priority, Content: content}
}
