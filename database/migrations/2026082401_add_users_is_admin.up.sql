-- Issue #511: single admin bit for the admin surface.
-- All existing users default to non-admin; the first admin is promoted
-- with a documented UPDATE (see database/migrations/README.md).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
