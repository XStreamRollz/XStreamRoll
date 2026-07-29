-- Migration: 2026080501_add_stream_visibility (UP)
--
-- Adds `streams.visibility` to support public/private stream listings
-- (issue #393 — "feature: Implement stream visibility (public/private)").
-- Mirrors the same shape and constraints present in database/schema.sql
-- so a fresh DB created from schema.sql and a migrated DB end up
-- structurally identical.
--
-- The column is NOT NULL DEFAULT 'private' so existing rows are
-- backfilled in place by PostgreSQL on ADD COLUMN — no separate data
-- backfill migration is required.

BEGIN;

ALTER TABLE streams
    ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'private';

-- Constrain to the documented enum. A CHECK constraint is safer than
-- an enum type for schema-evolution; rolling out a new visibility
-- value only requires an ALTER TABLE … DROP/ADD CONSTRAINT, not a
-- whole-table rewrite. PostgreSQL rejects illegal values on insert
-- and update with a clear error.
ALTER TABLE streams
    DROP CONSTRAINT IF EXISTS streams_visibility_check;
ALTER TABLE streams
    ADD CONSTRAINT streams_visibility_check
        CHECK (visibility IN ('public', 'private'));

-- Index that supports both:
--   - "list streams visible to this user" where the API filters by
--     (visibility = 'public' OR user_id = $N) — sequential scan is
--     fine for small tables but the index keeps p95 latency flat as
--     the streams table grows.
--   - "list only public streams" (e.g. for a future /v1/discover
--     endpoint) without scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_streams_visibility
    ON streams(visibility);

COMMIT;
