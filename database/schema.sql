-- Stellar Streaming Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Streams table
CREATE TABLE IF NOT EXISTS streams (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'inactive',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stream data table
CREATE TABLE IF NOT EXISTS stream_data (
    id SERIAL PRIMARY KEY,
    stream_id INTEGER NOT NULL REFERENCES streams(id),
    data JSONB NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stream events table for processed events
CREATE TABLE IF NOT EXISTS stream_events (
    id SERIAL PRIMARY KEY,
    stream_id INTEGER NOT NULL REFERENCES streams(id),
    event_type VARCHAR(100),
    event_data JSONB NOT NULL,
    processed_by VARCHAR(100),
    processing_latency_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_streams_user_id ON streams(user_id);
CREATE INDEX idx_stream_data_stream_id ON stream_data(stream_id);
CREATE INDEX idx_stream_data_timestamp ON stream_data(timestamp);

-- Index for efficient event querying
CREATE INDEX idx_stream_events_stream_id ON stream_events(stream_id);
CREATE INDEX idx_stream_events_created_at ON stream_events(created_at);

-- ---------------------------------------------------------------------
-- Categorization: tags applied to streams
-- ---------------------------------------------------------------------

-- Tag catalogue. `slug` is the canonical, URL-safe identifier used by
-- the API; `name` preserves the human-friendly label as originally
-- entered. Both columns are unique to make lookups by either form safe.
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    slug VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tags_name_unique UNIQUE (name),
    CONSTRAINT tags_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);

-- Join table associating streams with tags. ON DELETE CASCADE keeps the
-- table self-pruning when either side disappears; the composite unique
-- constraint prevents a stream from being tagged twice with the same
-- tag.
CREATE TABLE IF NOT EXISTS stream_tags (
    stream_id INTEGER NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (stream_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_stream_tags_stream_id ON stream_tags(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_tags_tag_id    ON stream_tags(tag_id);

-- ---------------------------------------------------------------------
-- Issue #73: Indexes for common query patterns
-- Rollback: DROP INDEX idx_streams_user_id_status, idx_stream_events_stream_id_occurred_at, idx_users_email;
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_streams_user_id_status
    ON streams(user_id, status);

CREATE INDEX IF NOT EXISTS idx_stream_events_stream_id_occurred_at
    ON stream_events(stream_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stream_events_stream_id_created_at_latency
    ON stream_events(stream_id, created_at DESC)
    INCLUDE (event_type, processing_latency_ms);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON users(email);

-- ---------------------------------------------------------------------
-- Issue #75: Notifications table
-- Rollback: DROP TABLE notifications;
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(100) NOT NULL,
    payload    JSONB NOT NULL DEFAULT '{}',
    read_at    TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Issue #348: retention — rows are deleted once past expires_at by the
    -- NotificationsService cleanup sweep. The application always sets this
    -- explicitly to NOW() + INTERVAL '30 days' on insert; the column
    -- default only backstops rows written outside that path.
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON notifications(expires_at);

-- ---------------------------------------------------------------------
-- Issue #392: Webhook delivery for stream lifecycle events
-- Rollback: DROP TABLE webhook_deliveries; DROP TABLE webhook_subscriptions;
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stream_id  INTEGER NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    events     TEXT[] NOT NULL,
    secret     VARCHAR(255) NOT NULL,
    active     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_user_id
    ON webhook_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_stream_id_active
    ON webhook_subscriptions(stream_id)
    WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_events
    ON webhook_subscriptions USING GIN (events);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id                    SERIAL PRIMARY KEY,
    webhook_subscription_id INTEGER NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event                 VARCHAR(100) NOT NULL,
    payload               JSONB NOT NULL,
    status                VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempt_count         INTEGER NOT NULL DEFAULT 0,
    last_status_code      INTEGER,
    last_response_body    TEXT,
    last_error            TEXT,
    next_attempt_at       TIMESTAMP,
    delivered_at          TIMESTAMP,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT webhook_deliveries_status_check
        CHECK (status IN ('pending', 'success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription_id
    ON webhook_deliveries(webhook_subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending_next_attempt
    ON webhook_deliveries(next_attempt_at)
    WHERE status = 'pending';
