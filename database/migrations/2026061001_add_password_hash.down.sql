-- Migration: 2026061001_add_password_hash (DOWN)
--
-- Reverses 2026061001_add_password_hash.up.sql.

BEGIN;

ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

COMMIT;
