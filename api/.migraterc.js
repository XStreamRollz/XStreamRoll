// Issue #340 — node-pg-migrate configuration picked up automatically
// (auto-discovery looks for `.migraterc.js`, `migrate.config.js`, etc. in
// the current working directory). This file lives in `api/` so the
// `npm run migrate` scripts in `api/package.json` can invoke
// `node-pg-migrate up` with no arguments.
//
// `dir` is relative to this file's location so it resolves correctly
// regardless of where the runner is invoked from. Running `node-pg-migrate`
// from the repo root works the same way as from `api/` — node-pg-migrate
// resolves the directory relative to the config file's dir.

const path = require("path")

module.exports = {
  databaseUrl: process.env.DATABASE_URL,

  // The migrations directory lives next to the project root so it's
  // available in both the published API image (where `COPY . .` puts it
  // at `/app/database/migrations/`) and in any dev/CI checkout. Relative
  // path from this config file is required because node-pg-migrate uses
  // it as a literal path.
  dir: path.resolve(__dirname, "../database/migrations"),

  // SQL — the existing migration files are .up.sql / .down.sql pairs;
  // no JS migration files exist, so we set the language explicitly.
  migrationFileLanguage: "sql",

  // node-pg-migrate tracks applied migrations in a Postgres table.
  // The default name is `pgmigrations`; we keep the default.
  // migrationsTable: "pgmigrations",

  count: Infinity,
  schema: undefined,
  // Skip non-migration files in the dir (README + this config itself).
  ignorePattern: "README\\.md|\\.DS_Store",
}
