package service

import (
	"context"
	"strings"
	"testing"
)

func makeMessages(n int, size int) []Message {
	msgs := make([]Message, n)
	for i := 0; i < n; i++ {
		role := "user"
		if i%2 == 1 {
			role = "assistant"
		}
		msgs[i] = Message{
			Role:    role,
			Content: strings.Repeat("x", size),
		}
	}
	return msgs
}

func TestCompactor_NeedsCompaction(t *testing.T) {
	c := NewCompactor()
	c.MaxChars = 100

	msgs := makeMessages(5, 30) // 150 chars total
	if !c.NeedsCompaction(msgs) {
		t.Error("should need compaction at 150 chars with max 100")
	}

	msgs = makeMessages(2, 20) // 40 chars total
	if c.NeedsCompaction(msgs) {
		t.Error("should not need compaction at 40 chars with max 100")
	}
}

func TestMicroCompact(t *testing.T) {
	c := NewCompactor()
	msgs := []Message{
		{Role: "user", Content: "hello"},
		{Role: "tool", Content: strings.Repeat("a", 1000)},
		{Role: "assistant", Content: "done"},
	}

	result, err := c.Compact(context.Background(), msgs, MicroCompact)
	if err != nil {
		t.Fatalf("Compact() error = %v", err)
	}

	if result.Messages[1].Content != truncateContent(strings.Repeat("a", 1000), 200) {
		t.Error("tool output should be truncated")
	}
	if result.Messages[0].Content != "hello" {
		t.Error("user message should be unchanged")
	}
	if result.CompactedLen >= result.OriginalLen {
		t.Error("compacted length should be less than original")
	}
}

func TestAutoCompact(t *testing.T) {
	c := NewCompactor()
	c.KeepRecent = 3
	msgs := []Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "msg1"},
		{Role: "assistant", Content: "reply1"},
		{Role: "user", Content: "msg2"},
		{Role: "assistant", Content: "reply2"},
		{Role: "user", Content: "msg3"},
		{Role: "assistant", Content: "reply3"},
	}

	result, err := c.Compact(context.Background(), msgs, AutoCompact)
	if err != nil {
		t.Fatalf("Compact() error = %v", err)
	}

	// Should have summary + 3 recent messages
	if len(result.Messages) != 4 { // 1 summary system + 3 recent
		t.Errorf("expected 4 messages, got %d", len(result.Messages))
	}
	if result.Summary == "" {
		t.Error("summary should not be empty after auto compact")
	}
	if !strings.Contains(result.Messages[0].Content, "Earlier conversation") {
		t.Error("first message should be the summary")
	}
}

func TestAutoCompact_NoCompactionNeeded(t *testing.T) {
	c := NewCompactor()
	c.KeepRecent = 10
	msgs := []Message{
		{Role: "user", Content: "msg1"},
		{Role: "assistant", Content: "reply1"},
	}

	result, err := c.Compact(context.Background(), msgs, AutoCompact)
	if err != nil {
		t.Fatalf("Compact() error = %v", err)
	}

	if len(result.Messages) != 2 {
		t.Errorf("should not compact when messages < KeepRecent, got %d", len(result.Messages))
	}
}

func TestSnipCompact(t *testing.T) {
	c := NewCompactor()
	c.KeepRecent = 2
	msgs := []Message{
		{Role: "system", Content: "system prompt"},
		{Role: "user", Content: "old1"},
		{Role: "assistant", Content: "old2"},
		{Role: "user", Content: "old3"},
		{Role: "user", Content: "recent1"},
		{Role: "assistant", Content: "recent2"},
	}

	result, err := c.Compact(context.Background(), msgs, SnipCompact)
	if err != nil {
		t.Fatalf("Compact() error = %v", err)
	}

	// Should have: system + compaction marker + 2 recent
	if len(result.Messages) != 4 {
		t.Errorf("expected 4 messages, got %d", len(result.Messages))
	}
	// First should be system message preserved
	if result.Messages[0].Content != "system prompt" {
		t.Error("system message should be preserved")
	}
	// Second should be compaction summary
	if !strings.Contains(result.Messages[1].Content, "Compacted") {
		t.Error("should have compaction summary")
	}
}

func TestCompactionResult_Ratio(t *testing.T) {
	c := NewCompactor()
	c.KeepRecent = 2
	msgs := []Message{
		{Role: "user", Content: strings.Repeat("a", 10000)},
		{Role: "assistant", Content: strings.Repeat("b", 10000)},
		{Role: "user", Content: strings.Repeat("c", 10000)},
		{Role: "assistant", Content: strings.Repeat("d", 10000)},
		{Role: "user", Content: "recent1"},
		{Role: "assistant", Content: "recent2"},
	}

	result, err := c.Compact(context.Background(), msgs, SnipCompact)
	if err != nil {
		t.Fatalf("Compact() error = %v", err)
	}

	ratio := float64(result.CompactedLen) / float64(result.OriginalLen)
	if ratio > 0.5 {
		t.Errorf("compacted ratio = %.2f, expected significant reduction", ratio)
	}
}
