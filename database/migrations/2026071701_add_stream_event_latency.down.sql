BEGIN;

DROP INDEX IF EXISTS idx_stream_events_stream_id_created_at_latency;

ALTER TABLE stream_events
    DROP COLUMN IF EXISTS processing_latency_ms;

COMMIT;
