-- Migration: 2026072901_add_users_soft_delete (UP)
--
-- Soft-delete for the users table (issue #344):
--   1. Drop the existing audit_logs.user_id FK constraint and recreate it
--      with ON DELETE SET NULL so deleting a user does not cascade-fail.
--   2. Add a deleted_at TIMESTAMPTZ column to the users table so the
--      application can soft-delete instead of issuing a hard DELETE.
--   3. Add an index on deleted_at so WHERE deleted_at IS NULL queries
--      are efficient (partial index, nulls are excluded from the index).

BEGIN;

-- 1. Fix the audit_logs FK constraint
ALTER TABLE audit_logs
    DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 2. Add soft-delete column to users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Partial index for active-user queries
CREATE INDEX IF NOT EXISTS idx_users_active
    ON users(id)
    WHERE deleted_at IS NULL;

COMMIT;
