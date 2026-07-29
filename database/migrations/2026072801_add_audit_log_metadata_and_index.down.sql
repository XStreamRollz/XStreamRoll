-- Rollback for 2026072801_add_audit_log_metadata_and_index.up.sql
-- Restores the original VARCHAR(100) action column and removes the metadata
-- column and action index added by the up migration.

DROP INDEX CONCURRENTLY IF EXISTS idx_audit_logs_action;

ALTER TABLE audit_logs DROP COLUMN IF EXISTS metadata;

-- Narrow action back to the original length.
-- NOTE: this will FAIL if any row already contains a value longer than 100
-- characters. Truncate / clean up data before running this rollback.
ALTER TABLE audit_logs
    ALTER COLUMN action TYPE VARCHAR(100);
