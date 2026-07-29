BEGIN;

-- Issue #336: Convert all TIMESTAMP columns to TIMESTAMPTZ.
-- PostgreSQL stores TIMESTAMP WITHOUT TIME ZONE as local time without
-- timezone info, meaning timestamps stored in UTC may be read as local
-- time — producing data corruption in distributed systems.
--
-- Each ALTER uses `AT TIME ZONE 'UTC'` which tells PostgreSQL: "the
-- existing raw value was recorded in UTC — treat it as such when
-- adding timezone awareness."  This is correct when the database
-- server runs in UTC and the application always writes UTC values.
--
-- The DEFAULT clause is rewritten to use NOW() instead of
-- CURRENT_TIMESTAMP.  In PostgreSQL these are functionally identical
-- for TIMESTAMPTZ, but the project convention prefers NOW() for
-- readability and consistency.

-- users
ALTER TABLE users
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT NOW();

-- streams
ALTER TABLE streams
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ
        USING updated_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at SET DEFAULT NOW();

-- stream_data
ALTER TABLE stream_data
    ALTER COLUMN timestamp TYPE TIMESTAMPTZ
        USING timestamp AT TIME ZONE 'UTC',
    ALTER COLUMN timestamp SET DEFAULT NOW();

-- stream_events
ALTER TABLE stream_events
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT NOW();

-- tags
ALTER TABLE tags
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT NOW();

-- stream_tags
ALTER TABLE stream_tags
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT NOW();

-- notifications
ALTER TABLE notifications
    ALTER COLUMN read_at TYPE TIMESTAMPTZ
        USING read_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT NOW();

-- notifications.expires_at is already TIMESTAMPTZ; align its DEFAULT
-- expression with the project convention (NOW() over CURRENT_TIMESTAMP)
ALTER TABLE notifications
    ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '30 days');

-- audit_logs (separate optional schema — guard with IF EXISTS)
ALTER TABLE IF EXISTS audit_logs
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT NOW();

-- webhook_subscriptions
ALTER TABLE webhook_subscriptions
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT NOW();

-- webhook_deliveries
ALTER TABLE webhook_deliveries
    ALTER COLUMN next_attempt_at TYPE TIMESTAMPTZ
        USING next_attempt_at AT TIME ZONE 'UTC',
    ALTER COLUMN delivered_at TYPE TIMESTAMPTZ
        USING delivered_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at SET DEFAULT NOW();

COMMIT;
