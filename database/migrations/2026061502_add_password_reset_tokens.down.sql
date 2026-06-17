-- Migration: 2026061502_add_password_reset_tokens (DOWN)
--
-- Reverses 2026061502_add_password_reset_tokens.up.sql.

BEGIN;

DROP TABLE IF EXISTS password_reset_tokens;

ALTER TABLE users DROP COLUMN IF EXISTS password_changed_at;

COMMIT;
