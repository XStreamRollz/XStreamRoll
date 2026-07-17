-- Migration: 2026071701_add_audit_logs (UP)
--
-- Adds the audit_logs table, moving the DDL that previously lived as a
-- standalone database/audit_logs.sql file into the numbered migration
-- chain (issue #333).

BEGIN;

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    ip VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

COMMIT;
