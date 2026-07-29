BEGIN;

-- Rollback for Issue #336: revert TIMESTAMPTZ columns back to TIMESTAMP.
-- Extracts the UTC value as a plain TIMESTAMP WITHOUT TIME ZONE.
-- The DEFAULT clause is restored to CURRENT_TIMESTAMP which matches
-- the original schema.sql definitions.

-- users
ALTER TABLE users
    ALTER COLUMN created_at TYPE TIMESTAMP
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

-- streams
ALTER TABLE streams
    ALTER COLUMN created_at TYPE TIMESTAMP
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN updated_at TYPE TIMESTAMP
        USING updated_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

-- stream_data
ALTER TABLE stream_data
    ALTER COLUMN timestamp TYPE TIMESTAMP
        USING timestamp AT TIME ZONE 'UTC',
    ALTER COLUMN timestamp SET DEFAULT CURRENT_TIMESTAMP;

-- stream_events
ALTER TABLE stream_events
    ALTER COLUMN created_at TYPE TIMESTAMP
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

-- tags
ALTER TABLE tags
    ALTER COLUMN created_at TYPE TIMESTAMP
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

-- stream_tags
ALTER TABLE stream_tags
    ALTER COLUMN created_at TYPE TIMESTAMP
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

-- notifications
ALTER TABLE notifications
    ALTER COLUMN read_at TYPE TIMESTAMP
        USING read_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at TYPE TIMESTAMP
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

-- notifications.expires_at default back to CURRENT_TIMESTAMP
ALTER TABLE notifications
    ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days');

-- audit_logs (separate optional schema — guard with IF EXISTS)
ALTER TABLE IF EXISTS audit_logs
    ALTER COLUMN created_at TYPE TIMESTAMP
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

-- webhook_subscriptions
ALTER TABLE webhook_subscriptions
    ALTER COLUMN created_at TYPE TIMESTAMP
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

-- webhook_deliveries
ALTER TABLE webhook_deliveries
    ALTER COLUMN next_attempt_at TYPE TIMESTAMP
        USING next_attempt_at AT TIME ZONE 'UTC',
    ALTER COLUMN delivered_at TYPE TIMESTAMP
        USING delivered_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at TYPE TIMESTAMP
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

COMMIT;
