-- Migration: 2026072301_add_notifications_expiry (UP)
--
-- Adds expires_at to notifications so old rows can be swept instead of
-- accumulating indefinitely (issue #348). Existing rows backfill to
-- created_at + 30 days rather than NOW() + 30 days so already-old
-- notifications become eligible for cleanup right away instead of all
-- getting a fresh 30-day lease at migration time.

BEGIN;

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE notifications
    SET expires_at = created_at + INTERVAL '30 days'
    WHERE expires_at IS NULL;

ALTER TABLE notifications
    ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
    ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON notifications(expires_at);

COMMIT;
