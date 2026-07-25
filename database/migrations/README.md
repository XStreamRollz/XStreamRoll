# Database Migrations

Each migration is shipped as a paired `.up.sql` / `.down.sql` file under
this directory. The filename convention is:

```
<YYYYMMDD><NN>_<short_description>.{up,down}.sql
```

where `<NN>` is a two-digit counter for migrations that land on the
same day (so ordering remains deterministic).

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

## Applying

```bash
# Forward
psql -d "$DATABASE_URL" -f database/migrations/2026051501_add_stream_tags.up.sql

# Rollback
psql -d "$DATABASE_URL" -f database/migrations/2026051501_add_stream_tags.down.sql
```

## Listing

| File                                       | Adds                                  |
| ------------------------------------------ | ------------------------------------- |
| `2026051501_add_stream_tags.up.sql`        | `tags`, `stream_tags`, supporting indexes |
| `2026061001_add_password_hash.up.sql`      | `users.password_hash` (nullable → backfill → `NOT NULL`, no default) |
| `2026061002_add_user_password_hash.up.sql` | `users.password_hash` — redundant re-add, no-op after `2026061001` via `IF NOT EXISTS` |
| `2026071701_add_stream_event_latency.up.sql` | `stream_events.processing_latency_ms`, covering analytics index |
| `2026072001_add_webhook_subscriptions.up.sql` | `webhook_subscriptions`, `webhook_deliveries`, supporting indexes |
| `2026072301_add_notifications_expiry.up.sql` | `notifications.expires_at`, backfilled from `created_at`, covering index |

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
