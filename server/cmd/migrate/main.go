package main

import (
	"database/sql"
	"log/slog"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/multica-ai/multicode/server/pkg/migrations"
)

func main() {
	if len(os.Args) < 2 {
		slog.Info("Usage: go run ./cmd/migrate <up|down|status|redo>")
		os.Exit(1)
	}

	command := os.Args[1]

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://multicode:multicode@localhost:5432/multicode?sslmode=disable"
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		slog.Error("unable to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		slog.Error("unable to ping database", "error", err)
		os.Exit(1)
	}

	// Use the legacy goose.Run API which properly handles the
	// NNN_name.{up,down}.sql naming convention.
	goose.SetBaseFS(migrations.EmbedMigrations)

	if err := goose.SetDialect("postgres"); err != nil {
		slog.Error("failed to set goose dialect", "error", err)
		os.Exit(1)
	}

	if err := goose.Run(command, db, "migrations"); err != nil {
		slog.Error("migration failed", "command", command, "error", err)
		os.Exit(1)
	}

	slog.Info("Done.")
}
