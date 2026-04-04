package migrations

import "embed"

//go:embed all:migrations
var EmbedMigrations embed.FS
