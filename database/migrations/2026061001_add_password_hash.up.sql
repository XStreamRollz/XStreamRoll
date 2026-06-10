-- Migration: 2026061001_add_password_hash (UP)
--
-- Adds a password_hash column to the users table for authentication.
-- Uses a placeholder default so existing rows (if any) don't fail,
-- but in practice production deployments should run this before any
-- user-facing registration flow goes live.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Backfill any existing rows with an empty string so the NOT NULL
-- constraint below does not fail. In practice this migration should
-- run against an empty or dev-only table.
UPDATE users SET password_hash = '' WHERE password_hash IS NULL;

ALTER TABLE users
  ALTER COLUMN password_hash SET NOT NULL;

COMMIT;
