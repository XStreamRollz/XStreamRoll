-- Migration: 2026082001_add_user_soft_delete (DOWN)
--
-- Reverses 2026082001_add_user_soft_delete.up.sql.
--
-- WARNING: rolling back will permanently DROP the deleted_at column. Any
-- previously soft-deleted rows will become indistinguishable from active
-- users. Only roll back when you are certain no rows have been
-- soft-deleted, or when you are rebuilding the database from scratch.

BEGIN;

-- 1. Drop the index before the column it depends on.
DROP INDEX IF EXISTS idx_users_deleted_at;

-- 2. Remove the soft-delete column.
ALTER TABLE users
    DROP COLUMN IF EXISTS deleted_at;

-- 3. Revert the audit_logs FK to its original state (no ON DELETE clause,
--    which is equivalent to NO ACTION in Postgres).
ALTER TABLE audit_logs
    DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);

COMMIT;
