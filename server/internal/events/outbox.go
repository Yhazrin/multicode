package events

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/multica-ai/alphenix/server/pkg/db/generated"
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

// WebhookPublisher publishes events as signed HTTP POST requests to configured webhooks.
type WebhookPublisher struct {
	pool       *pgxpool.Pool
	queries    *db.Queries
	httpClient *http.Client
}

// NewWebhookPublisher creates a WebhookPublisher.
func NewWebhookPublisher(pool *pgxpool.Pool, queries *db.Queries) *WebhookPublisher {
	return &WebhookPublisher{
		pool:    pool,
		queries: queries,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// webhookPayload is the JSON body sent to webhook endpoints.
type webhookPayload struct {
	Type        string `json:"type"`
	WorkspaceID string `json:"workspace_id"`
	ActorType   string `json:"actor_type"`
	ActorID     string `json:"actor_id"`
	Payload     any    `json:"payload"`
	CreatedAt   string `json:"created_at"`
}

// Publish sends the event to all active webhooks in the workspace that match the event type.
func (p *WebhookPublisher) Publish(ctx context.Context, e Event) error {
	webhooks, err := p.queries.ListActiveWebhooksByWorkspace(ctx, parseUUID(e.WorkspaceID))
	if err != nil {
		return fmt.Errorf("list webhooks: %w", err)
	}

	body, err := json.Marshal(webhookPayload{
		Type:        e.Type,
		WorkspaceID: e.WorkspaceID,
		ActorType:   e.ActorType,
		ActorID:     e.ActorID,
		Payload:     e.Payload,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	for _, wh := range webhooks {
		if !matchesEventType(e.Type, wh.EventTypes) {
			continue
		}
		if err := p.deliver(ctx, wh, body); err != nil {
			slog.Error("webhook delivery failed",
				"webhook_id", uuidToString(wh.ID),
				"url", wh.Url,
				"error", err)
			// Continue to next webhook even if one fails.
		}
	}
	return nil
}

// deliver sends a signed POST request with retry logic (3 attempts, exponential backoff).
func (p *WebhookPublisher) deliver(ctx context.Context, wh db.Webhook, body []byte) error {
	var lastErr error
	for attempt := range 3 {
		if attempt > 0 {
			backoff := time.Duration(1<<uint(attempt-1)) * time.Second
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, wh.Url, bytes.NewReader(body))
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Signature", signPayload(wh.Secret, body))

		resp, err := p.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}
		lastErr = fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}
	return fmt.Errorf("after 3 attempts: %w", lastErr)
}

// signPayload computes HMAC-SHA256 and returns hex-encoded signature.
func signPayload(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// matchesEventType returns true if the event type matches any of the configured patterns.
// Empty event_types means match all events.
func matchesEventType(eventType string, patterns []string) bool {
	if len(patterns) == 0 {
		return true
	}
	return slices.Contains(patterns, eventType)
}

func parseUUID(s string) pgtype.UUID {
	var u pgtype.UUID
	_ = u.Scan(s)
	return u
}

func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		u.Bytes[0:4], u.Bytes[4:6], u.Bytes[6:8], u.Bytes[8:10], u.Bytes[10:16])
}

// OutboxCleaner periodically removes old outbox rows.
type OutboxCleaner struct {
	queries  *db.Queries
	interval time.Duration
}

// NewOutboxCleaner creates a cleaner that runs at the given interval.
func NewOutboxCleaner(queries *db.Queries, interval time.Duration) *OutboxCleaner {
	return &OutboxCleaner{queries: queries, interval: interval}
}

// Start runs the cleanup loop until the context is cancelled.
func (c *OutboxCleaner) Start(ctx context.Context) {
	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := c.queries.CleanupOutbox(ctx); err != nil {
				slog.Error("outbox cleanup failed", "error", err)
			}
		}
	}
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
