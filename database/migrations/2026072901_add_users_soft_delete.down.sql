-- Migration: 2026072901_add_users_soft_delete (DOWN)
--
-- Rollback: revert soft-delete column and restore the original FK.

BEGIN;

-- 1. Drop the partial index
DROP INDEX IF EXISTS idx_users_active;

-- 2. Remove the soft-delete column
ALTER TABLE users
    DROP COLUMN IF EXISTS deleted_at;

-- 3. Restore the original FK constraint (no ON DELETE SET NULL)
ALTER TABLE audit_logs
    DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);

COMMIT;
