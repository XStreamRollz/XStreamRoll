-- Migration: 2026061001_add_user_password_hash (DOWN)
--
-- Reverses 2026061001_add_user_password_hash.up.sql. Drops the
-- password_hash column from the users table.

BEGIN;

ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

COMMIT;
