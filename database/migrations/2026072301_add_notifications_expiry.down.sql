-- Migration: 2026072301_add_notifications_expiry (DOWN)

BEGIN;

DROP INDEX IF EXISTS idx_notifications_expires_at;

ALTER TABLE notifications
    DROP COLUMN IF EXISTS expires_at;

COMMIT;
