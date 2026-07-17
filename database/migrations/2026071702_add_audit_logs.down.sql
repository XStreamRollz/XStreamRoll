-- Migration: 2026071701_add_audit_logs (DOWN)
--
-- Reverses 2026071701_add_audit_logs.up.sql.

BEGIN;

DROP TABLE IF EXISTS audit_logs;

COMMIT;
