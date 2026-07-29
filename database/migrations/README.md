# Database Migrations

> **Issue #340** — applied migrations are now tracked by
> [node-pg-migrate](https://github.com/salsita/node-pg-migrate). The
> runner replaces the previous "manually invoke each `psql -f` script"
> workflow and the legacy `apply-migrations.sh` helper. Old psql
> invocations still work against an existing migration file (they
> remain idempotent), but new deployments and CI should use the
> tracked runner so future rollouts know which migrations have already
> been applied.

Each migration is shipped as a paired `.up.sql` / `.down.sql` file under
this directory. node-pg-migrate's SQL mode accepts the existing
`<prefix>_<short_description>.up.sql` / `.down.sql` layout unchanged.
The `<prefix>` is any sortable string; existing migrations use
`<YYYYMMDD><NN>` where `<NN>` is a two-digit counter for migrations
that land on the same day. New ones generated via `npm run migrate:create`
land with the timestamp that node-pg-migrate picks at creation time —
lexicographic ordering keeps both styles in lockstep.

## Conventions

- Every migration runs inside a single `BEGIN; ... COMMIT;` block so
  partial application leaves the schema unchanged on failure.
- All `CREATE` / `DROP` statements use `IF NOT EXISTS` / `IF EXISTS`
  guards so migrations are idempotent and safe to re-run.
- `DROP TABLE` statements in `.down.sql` files deliberately omit
  `CASCADE` — the rollback should fail loudly if unexpected dependents
  exist.
- The cumulative state produced by applying every migration in order
  must be byte-equivalent to the schema in `database/schema.sql`.

## Applying (recommended)

The change is intentionally backwards-compatible: every existing
migration is already idempotent (`CREATE ... IF NOT EXISTS`), so running
`node-pg-migrate up` against a database that already has the schema
applied manually will succeed without double-applying anything. The
runner records each migration in a `pgmigrations` table so subsequent
invocations only run the unappplied ones.

```bash
# Forward: apply all pending migrations
cd api && npm run migrate

# Roll back the most recently-applied migration
cd api && npm run migrate:down

# Re-apply the most recently-applied migration (after fixing the SQL)
cd api && npm run migrate:redo

# Generate a new migration pair (creates <timestamp>_<name>.up.sql and .down.sql)
cd api && npm run migrate:create my-change
```

The runner reads its configuration from `api/.migraterc.js`, which
points `dir` at this directory and sets `migrationFileLanguage: "sql"`.
`DATABASE_URL` is consumed from the environment the same way NestJS
already reads it at runtime.

## Applying (legacy psql fallback)

If you need to maintain a database that predates the migration runner
and don't want to introduce node-pg-migrate, the original psql-based
workflow remains valid because every migration is idempotent:

```bash
# Forward
psql -d "$DATABASE_URL" -f database/migrations/2026051501_add_stream_tags.up.sql

# Rollback
psql -d "$DATABASE_URL" -f database/migrations/2026051501_add_stream_tags.down.sql
```

## Listing

| File                                                  | Adds                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `2026051501_add_stream_tags.up.sql`                   | `tags`, `stream_tags`, supporting indexes                                                                                            |
| `2026061001_add_password_hash.up.sql`                 | `users.password_hash` (nullable → backfill → `NOT NULL`, no default)                                                                 |
| `2026061002_add_user_password_hash.up.sql`            | `users.password_hash` — redundant re-add, no-op after `2026061001` via `IF NOT EXISTS`                                               |
| `2026061502_add_password_reset_tokens.up.sql`         | `password_reset_tokens` table for forgot/reset password flow                                                                         |
| `2026071701_add_stream_event_latency.up.sql`          | `stream_events.processing_latency_ms`, covering analytics index                                                                      |
| `2026072001_add_webhook_subscriptions.up.sql`         | `webhook_subscriptions`, `webhook_deliveries`, supporting indexes                                                                    |
| `2026072301_add_notifications_expiry.up.sql`          | `notifications.expires_at`, backfilled from `created_at`, covering index                                                             |
| `2026072501_add_composite_stream_events_index.up.sql` | `idx_stream_events_stream_id_created_at_desc` — composite index for the `WHERE stream_id = ? ORDER BY created_at DESC` query pattern |
| `2026072801_alter_timestamp_to_timestamptz.up.sql`    | Converts all `TIMESTAMP` columns to `TIMESTAMPTZ` across every table; rewrites `DEFAULT CURRENT_TIMESTAMP` → `DEFAULT NOW()`         |
| `2026080501_add_stream_visibility.up.sql`             | `streams.visibility` (`public` \| `private`, default `private`), CHECK constraint, supporting index                                  |
| `2026082001_add_user_soft_delete.up.sql`               | `users.deleted_at`, `idx_users_deleted_at`, `audit_logs.user_id` FK changed to `ON DELETE SET NULL`                                 |

> **Note on `2026061001` / `2026061002`:** both migrations add the same
> `users.password_hash` column. `2026061001_add_password_hash` is the
> canonical one — it matches `database/schema.sql` exactly
> (`VARCHAR(255) NOT NULL`, no default). `2026061002_add_user_password_hash`
> previously collided on the `2026061001` counter (see issue #203); it has
> been renumbered to keep counters unique. Because every `ADD COLUMN`
> uses `IF NOT EXISTS`, applying both in order leaves the canonical,
> default-free column in place and reproduces `schema.sql`.

## Notifications retention policy (issue #348)

`notifications` rows expire 30 days after creation instead of accumulating
forever:

- Every insert (`NotificationsDbRepository.create`) explicitly sets
  `expires_at = NOW() + INTERVAL '30 days'`. The column default (same
  expression) only backstops rows written outside that path.
- `NotificationsService.sweepExpired` runs on a fixed interval
  (`@Interval`, matching the retry-sweep pattern used by
  `WebhooksService`) and deletes rows with `DELETE FROM notifications
WHERE expires_at < NOW()`, in batches, until nothing due remains.
- `idx_notifications_expires_at` keeps that DELETE an index range scan
  rather than a full table scan as the table grows.

Read notifications still expire on the same 30-day schedule as unread
ones — this is a hard retention window, not an unread-only cleanup.
