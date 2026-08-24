-- Issue #511: rollback of the admin flag. Drops the column and any
-- admin grants made since the migration was applied.
ALTER TABLE users DROP COLUMN IF EXISTS is_admin;
