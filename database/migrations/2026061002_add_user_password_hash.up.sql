-- Migration: 2026061001_add_user_password_hash (UP)
--
-- Adds the `password_hash` column to the `users` table so that
-- user registration can store bcrypt-hashed passwords. Mirrors the
-- same shape present in database/schema.sql.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL DEFAULT '';

COMMIT;
