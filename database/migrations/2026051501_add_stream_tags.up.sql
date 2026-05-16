-- Migration: 2026051501_add_stream_tags (UP)
--
-- Adds the `tags` catalogue and the `stream_tags` join table that links
-- streams to one or more tags. Mirrors the same shape and constraints
-- present in database/schema.sql so a fresh DB created from schema.sql
-- and a migrated DB end up structurally identical.

BEGIN;

CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    slug VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tags_name_unique UNIQUE (name),
    CONSTRAINT tags_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);

CREATE TABLE IF NOT EXISTS stream_tags (
    stream_id INTEGER NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (stream_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_stream_tags_stream_id ON stream_tags(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_tags_tag_id    ON stream_tags(tag_id);

COMMIT;
