package events

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// OutboxRepository persists events to the outbox table for reliable delivery.
type OutboxRepository struct {
	pool *pgxpool.Pool
}

// NewOutboxRepository creates a new OutboxRepository.
func NewOutboxRepository(pool *pgxpool.Pool) *OutboxRepository {
	return &OutboxRepository{pool: pool}
}

// Save persists an event to the outbox table.
func (r *OutboxRepository) Save(ctx context.Context, e Event) error {
	payload, err := json.Marshal(e.Payload)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx,
		`INSERT INTO outbox (event_type, workspace_id, actor_type, actor_id, payload)
		 VALUES ($1, $2, $3, $4, $5)`,
		e.Type, e.WorkspaceID, e.ActorType, e.ActorID, payload)
	return err
}

// Publisher is an interface for sending events to external systems.
type Publisher interface {
	Publish(ctx context.Context, e Event) error
}

// NoOpPublisher is a Publisher that does nothing.
type NoOpPublisher struct{}

// Publish does nothing.
func (NoOpPublisher) Publish(ctx context.Context, e Event) error {
	return nil
}

// OutboxWorker processes events from the outbox table and publishes them via a Publisher.
type OutboxWorker struct {
	repo      *OutboxRepository
	publisher Publisher
	interval  time.Duration
}

// NewOutboxWorker creates a new OutboxWorker.
func NewOutboxWorker(repo *OutboxRepository, publisher Publisher, interval time.Duration) *OutboxWorker {
	return &OutboxWorker{
		repo:      repo,
		publisher: publisher,
		interval:  interval,
	}
}

// Start begins polling the outbox table and publishing events.
func (w *OutboxWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.processBatch(ctx)
		}
	}
}

func (w *OutboxWorker) processBatch(ctx context.Context) {
	rows, err := w.repo.pool.Query(ctx,
		`SELECT id, event_type, workspace_id, actor_type, actor_id, payload
		 FROM outbox
		 ORDER BY created_at ASC
		 LIMIT 100`)
	if err != nil {
		slog.Error("outbox worker: failed to query", "error", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		var eventType, workspaceID, actorType, actorID string
		var payload []byte
		if err := rows.Scan(&id, &eventType, &workspaceID, &actorType, &actorID, &payload); err != nil {
			slog.Error("outbox worker: failed to scan", "error", err)
			continue
		}

		var payloadData any
		if err := json.Unmarshal(payload, &payloadData); err != nil {
			slog.Error("outbox worker: failed to unmarshal payload", "error", err)
			continue
		}

		e := Event{
			Type:        eventType,
			WorkspaceID: workspaceID,
			ActorType:   actorType,
			ActorID:     actorID,
			Payload:     payloadData,
		}

		if err := w.publisher.Publish(ctx, e); err != nil {
			slog.Error("outbox worker: failed to publish", "error", err)
			continue
		}

		if _, err := w.repo.pool.Exec(ctx, `DELETE FROM outbox WHERE id = $1`, id); err != nil {
			slog.Error("outbox worker: failed to delete", "error", err)
		}
	}
}

// WithOutbox configures the Bus to persist events to the outbox repository.
func (b *Bus) WithOutbox(repo *OutboxRepository) {
	b.SubscribeAll(func(e Event) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := repo.Save(ctx, e); err != nil {
			slog.Error("failed to save event to outbox", "error", err, "event_type", e.Type)
		}
	})
}
