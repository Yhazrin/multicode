package events

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// OutboxRepository persists events to the outbox_messages table for reliable delivery.
type OutboxRepository struct {
	pool *pgxpool.Pool
}

// NewOutboxRepository creates a new outbox repository.
func NewOutboxRepository(pool *pgxpool.Pool) *OutboxRepository {
	return &OutboxRepository{pool: pool}
}

// Write persists an event to the outbox table within an existing transaction.
func (o *OutboxRepository) Write(ctx context.Context, e Event) error {
	payload, err := json.Marshal(e.Payload)
	if err != nil {
		return err
	}
	_, err = o.pool.Exec(ctx,
		`INSERT INTO outbox_messages (event_type, payload, workspace_id, created_at)
		 VALUES ($1, $2, $3, now())`,
		e.Type, payload, e.WorkspaceID,
	)
	return err
}

// FetchUnprocessed returns a batch of unprocessed outbox messages.
func (o *OutboxRepository) FetchUnprocessed(ctx context.Context, limit int) ([]OutboxRow, error) {
	rows, err := o.pool.Query(ctx,
		`SELECT id, event_type, payload, workspace_id
		 FROM outbox_messages
		 WHERE processed_at IS NULL AND dead_lettered_at IS NULL
		   AND (next_attempt_at IS NULL OR next_attempt_at <= now())
		 ORDER BY created_at ASC
		 LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []OutboxRow
	for rows.Next() {
		var r OutboxRow
		if err := rows.Scan(&r.ID, &r.EventType, &r.Payload, &r.WorkspaceID); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// MarkProcessed marks an outbox message as processed.
func (o *OutboxRepository) MarkProcessed(ctx context.Context, id string) error {
	_, err := o.pool.Exec(ctx,
		`UPDATE outbox_messages SET processed_at = now() WHERE id = $1`, id)
	return err
}

// MarkFailed increments retry count and sets next_attempt_at, or dead-letters the message.
func (o *OutboxRepository) MarkFailed(ctx context.Context, id string, errMsg string, maxRetries int) error {
	_, err := o.pool.Exec(ctx,
		`UPDATE outbox_messages SET
		    retry_count = retry_count + 1,
		    last_error = $2,
		    next_attempt_at = now() + (INTERVAL '10 seconds' * (retry_count + 1)),
		    dead_lettered_at = CASE WHEN retry_count + 1 >= $3 THEN now() ELSE NULL END,
		    dead_letter_reason = CASE WHEN retry_count + 1 >= $3 THEN $2 ELSE NULL END
		 WHERE id = $1`, id, errMsg, maxRetries)
	return err
}

// OutboxRow represents a single unprocessed outbox message.
type OutboxRow struct {
	ID          string
	EventType   string
	Payload     []byte
	WorkspaceID string
}

// EventPublisher publishes events to external systems.
type EventPublisher interface {
	Publish(ctx context.Context, row OutboxRow) error
}

// NoOpPublisher is a publisher that does nothing (for development/testing).
type NoOpPublisher struct{}

func (n NoOpPublisher) Publish(_ context.Context, _ OutboxRow) error {
	return nil
}

// OutboxWorker polls the outbox table and delivers events via a publisher.
type OutboxWorker struct {
	repo      *OutboxRepository
	publisher EventPublisher
	interval  time.Duration
	maxRetry  int
}

// NewOutboxWorker creates a new outbox worker.
func NewOutboxWorker(repo *OutboxRepository, publisher EventPublisher, interval time.Duration) *OutboxWorker {
	return &OutboxWorker{
		repo:      repo,
		publisher: publisher,
		interval:  interval,
		maxRetry:  5,
	}
}

// Start begins the polling loop. It runs until the context is cancelled.
func (w *OutboxWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	slog.Info("outbox worker started", "interval", w.interval)

	for {
		select {
		case <-ctx.Done():
			slog.Info("outbox worker stopped")
			return
		case <-ticker.C:
			w.process(ctx)
		}
	}
}

func (w *OutboxWorker) process(ctx context.Context) {
	rows, err := w.repo.FetchUnprocessed(ctx, 50)
	if err != nil {
		slog.Error("outbox fetch failed", "error", err)
		return
	}

	for _, row := range rows {
		if err := w.publisher.Publish(ctx, row); err != nil {
			slog.Error("outbox publish failed", "id", row.ID, "event_type", row.EventType, "error", err)
			if ferr := w.repo.MarkFailed(ctx, row.ID, err.Error(), w.maxRetry); ferr != nil {
				slog.Error("outbox mark failed failed", "id", row.ID, "error", ferr)
			}
			continue
		}
		if err := w.repo.MarkProcessed(ctx, row.ID); err != nil {
			slog.Error("outbox mark processed failed", "id", row.ID, "error", err)
		}
	}
}

// WithOutbox registers a global handler on the bus that writes events to the outbox.
func (b *Bus) WithOutbox(repo *OutboxRepository) {
	b.SubscribeAll(func(e Event) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := repo.Write(ctx, e); err != nil {
			slog.Error("outbox write failed", "event_type", e.Type, "error", err)
		}
	})
}
