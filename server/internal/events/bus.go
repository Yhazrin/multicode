package events

import (
	"log/slog"
	"sort"
	"sync"
)

// Event represents a domain event published by handlers or services.
type Event struct {
	Type        string // e.g. "issue:created", "inbox:new"
	WorkspaceID string // routes to correct Hub room
	ActorType   string // "member", "agent", or "system"
	ActorID     string
	Payload     any // JSON-serializable, same shape as current WS payloads
}

// Handler is a function that processes an event.
type Handler func(Event)

// Priority constants for handler registration. Lower values run first.
const (
	PrioritySubscribers  = 10 // Subscriber auto-subscribe (writes issue_subscriber rows)
	PriorityActivity     = 20 // Activity logging
	PriorityNotification = 30 // Notification creation (reads issue_subscriber rows)
	PriorityDefault      = 50 // Unprioritized handlers (Subscribe without priority)
)

type handlerEntry struct {
	priority int
	handler  Handler
}

// Bus is an in-process synchronous pub/sub event bus.
type Bus struct {
	mu             sync.RWMutex
	listeners      map[string][]handlerEntry
	globalHandlers []handlerEntry
}

// New creates a new event bus.
func New() *Bus {
	return &Bus{
		listeners: make(map[string][]handlerEntry),
	}
}

// Subscribe registers a handler for a given event type at the default priority.
// Handlers are called synchronously, ordered by priority then registration order.
func (b *Bus) Subscribe(eventType string, h Handler) {
	b.SubscribeWithPriority(eventType, PriorityDefault, h)
}

// SubscribeWithPriority registers a handler at a specific priority.
// Lower priority values run first. Within the same priority, registration order
// is preserved. Use PrioritySubscribers, PriorityActivity, PriorityNotification
// constants for well-known tiers.
func (b *Bus) SubscribeWithPriority(eventType string, priority int, h Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.listeners[eventType] = append(b.listeners[eventType], handlerEntry{priority: priority, handler: h})
}

// SubscribeAll registers a handler that receives ALL events regardless of type.
// Global handlers are called after type-specific handlers, sorted by priority.
func (b *Bus) SubscribeAll(h Handler) {
	b.SubscribeAllWithPriority(PriorityDefault, h)
}

// SubscribeAllWithPriority registers a global handler at a specific priority.
func (b *Bus) SubscribeAllWithPriority(priority int, h Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.globalHandlers = append(b.globalHandlers, handlerEntry{priority: priority, handler: h})
}

// sortHandlers returns a copy of entries sorted by priority (ascending).
func sortHandlers(entries []handlerEntry) []handlerEntry {
	sorted := make([]handlerEntry, len(entries))
	copy(sorted, entries)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].priority < sorted[j].priority
	})
	return sorted
}

// Publish dispatches an event to all registered handlers for that event type.
// Type-specific handlers run first (sorted by priority), then global handlers
// (also sorted by priority). Each handler is called synchronously. Panics in
// individual handlers are recovered so one failing handler does not prevent
// others from executing.
func (b *Bus) Publish(e Event) {
	b.mu.RLock()
	handlers := sortHandlers(b.listeners[e.Type])
	globals := sortHandlers(b.globalHandlers)
	b.mu.RUnlock()

	for _, entry := range handlers {
		h := entry.handler
		func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("panic in event listener", "event_type", e.Type, "recovered", r)
				}
			}()
			h(e)
		}()
	}

	for _, entry := range globals {
		h := entry.handler
		func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("panic in global event listener", "event_type", e.Type, "recovered", r)
				}
			}()
			h(e)
		}()
	}
}

// PublishAsync dispatches an event asynchronously. Each handler runs in its own
// goroutine. Handlers are still dispatched in priority order within each goroutine
// set — but since they run concurrently, priority is only a best-effort ordering.
func (b *Bus) PublishAsync(e Event) {
	b.mu.RLock()
	handlers := sortHandlers(b.listeners[e.Type])
	globals := sortHandlers(b.globalHandlers)
	b.mu.RUnlock()

	for _, entry := range handlers {
		h := entry.handler
		go func(h Handler) {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("panic in async event listener", "event_type", e.Type, "recovered", r)
				}
			}()
			h(e)
		}(h)
	}

	for _, entry := range globals {
		h := entry.handler
		go func(h Handler) {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("panic in async global event listener", "event_type", e.Type, "recovered", r)
				}
			}()
			h(e)
		}(h)
	}
}
