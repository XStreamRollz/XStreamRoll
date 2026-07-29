-- Issue #326: enforce AuditAction enum and add structured metadata to audit_logs
-- Rollback: see 2026072801_add_audit_log_metadata_and_index.down.sql
--
-- Changes:
--   1. Widen the `action` column to VARCHAR(255) so all enum values fit
--      (previous limit was VARCHAR(100)).
--   2. Add a `metadata` JSONB column for variable data (email, reason, …)
--      that was previously embedded directly in the free-form action string.
--   3. Create an index on `action` so audit queries can filter by event type
--      without a sequential scan.

-- 1. Widen action column
ALTER TABLE audit_logs
    ALTER COLUMN action TYPE VARCHAR(255);

-- 2. Add metadata column (NOT NULL with empty-object default so existing rows
--    are valid immediately and no backfill is required)
ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- 3. Action index (CONCURRENTLY avoids a write-lock on busy tables;
--    safe to run against an empty table too)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action
    ON audit_logs(action);
