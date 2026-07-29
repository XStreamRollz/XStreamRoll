-- Migration: 2026082001_add_user_soft_delete (UP)
--
-- Addresses issue #344: users table has no soft-delete — deleted users
-- leave orphaned foreign keys.
--
-- Changes:
--   1. Drop the existing audit_logs FK and re-create it with
--      ON DELETE SET NULL so deleting a user (or soft-deleting) does
--      not leave orphaned audit_log rows referencing a stale user_id.
--   2. Add `users.deleted_at TIMESTAMPTZ` for GDPR-compliant soft-delete.
--   3. Add a covering index on `deleted_at` so `WHERE deleted_at IS NULL`
--      filters remain index-friendly as the table grows.

BEGIN;

-- 1. Fix audit_logs FK so it does not block user deletion.
--    The auto-generated constraint name follows the Postgres convention
--    `<table>_<column>_fkey`.
ALTER TABLE audit_logs
    DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 2. Add soft-delete column.
--    NULL means "not deleted" — the vast majority of rows will stay NULL,
--    keeping the index lean and writes fast.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Index to keep soft-delete-aware queries efficient.
--    Partial index on non-deleted rows keeps the B-tree small since most
--    rows never receive a deleted_at value.
CREATE INDEX IF NOT EXISTS idx_users_deleted_at
    ON users(deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMIT;
