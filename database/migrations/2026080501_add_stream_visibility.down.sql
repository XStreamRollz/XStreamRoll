-- Migration: 2026080501_add_stream_visibility (DOWN)
--
-- Reverses 2026080501_add_stream_visibility.up.sql.
--
-- Drops the visibility-specific supporting index BEFORE the column so
-- the reverse order matches the forward install. The CHECK constraint
-- is preserved by PostgreSQL until the column itself is dropped, so
-- we drop it explicitly for clarity in `psql` output.

BEGIN;

DROP INDEX IF EXISTS idx_streams_visibility;

ALTER TABLE streams
    DROP CONSTRAINT IF EXISTS streams_visibility_check;

ALTER TABLE streams
    DROP COLUMN IF EXISTS visibility;

COMMIT;
