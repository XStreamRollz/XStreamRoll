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

> **Note on `2026061001` / `2026061002`:** both migrations add the same
> `users.password_hash` column. `2026061001_add_password_hash` is the
> canonical one — it matches `database/schema.sql` exactly
> (`VARCHAR(255) NOT NULL`, no default). `2026061002_add_user_password_hash`
> previously collided on the `2026061001` counter (see issue #203); it has
> been renumbered to keep counters unique. Because every `ADD COLUMN`
> uses `IF NOT EXISTS`, applying both in order leaves the canonical,
> default-free column in place and reproduces `schema.sql`.