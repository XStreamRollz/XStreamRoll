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
