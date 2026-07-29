-- Issue #393 rollback.
DROP INDEX IF EXISTS idx_streams_visibility;
ALTER TABLE streams DROP CONSTRAINT IF EXISTS streams_visibility_check;
ALTER TABLE streams DROP COLUMN IF EXISTS visibility;
