BEGIN;

ALTER TABLE stream_events
    ADD COLUMN IF NOT EXISTS processing_latency_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_stream_events_stream_id_created_at_latency
    ON stream_events(stream_id, created_at DESC)
    INCLUDE (event_type, processing_latency_ms);

COMMIT;
