BEGIN;

-- Issue #392: webhook delivery for stream lifecycle events.

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

-- Dispatch lookup: "which active subscriptions on this stream want this event".
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

-- Retry sweep lookup: due, not-yet-terminal deliveries.
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending_next_attempt
    ON webhook_deliveries(next_attempt_at)
    WHERE status = 'pending';

COMMIT;
