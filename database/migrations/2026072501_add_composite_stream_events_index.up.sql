-- Create composite index on stream_events for the most common query pattern:
-- filtering by stream_id and ordering by created_at DESC.
--
-- This index enables a simple index range scan with no sort step, replacing
-- the need for the old single-column index on stream_id alone.
--
-- CONCURRENTLY ensures the index is built without locking writes, which is
-- safe for production deployments. When applied as part of the initial
-- schema build (database/schema.sql), the CONCURRENTLY keyword is a no-op
-- because the table is empty.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stream_events_stream_id_created_at_desc
    ON stream_events(stream_id, created_at DESC);
