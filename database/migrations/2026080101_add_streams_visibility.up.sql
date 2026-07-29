-- Issue #393: stream visibility (public/private).
-- Defaults new and existing rows to "private" so creation consumers
-- never accidentally expose a stream. Owners flip the field
-- explicitly via PATCH /streams/:id { visibility: "public" }.

ALTER TABLE streams
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) NOT NULL DEFAULT 'private';

-- Idempotent CHECK constraint: pg 9.6 has IF NOT EXISTS for indexes
-- but not constraints, so we guard with pg_catalog.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'streams_visibility_check'
  ) THEN
    ALTER TABLE streams
      ADD CONSTRAINT streams_visibility_check
      CHECK (visibility IN ('public', 'private'));
  END IF;
END
$$;

-- Allow the public discover surface to filter cheaply.
CREATE INDEX IF NOT EXISTS idx_streams_visibility
  ON streams(visibility)
  WHERE visibility = 'public';
