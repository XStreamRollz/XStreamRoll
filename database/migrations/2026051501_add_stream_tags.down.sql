-- Migration: 2026051501_add_stream_tags (DOWN)
--
-- Reverses 2026051501_add_stream_tags.up.sql. Drops the join table
-- first so the FK from stream_tags.tag_id is removed before the parent
-- `tags` table goes. CASCADE is intentionally omitted on the parent
-- DROPs so the rollback fails loudly if unexpected dependents exist.

BEGIN;

DROP INDEX IF EXISTS idx_stream_tags_tag_id;
DROP INDEX IF EXISTS idx_stream_tags_stream_id;
DROP TABLE IF EXISTS stream_tags;

DROP INDEX IF EXISTS idx_tags_slug;
DROP TABLE IF EXISTS tags;

COMMIT;
