-- Migration: 2026061502_add_password_reset_tokens (UP)
--
-- Adds the password reset token store and tracks password change time
-- so old JWTs can be invalidated after a password reset.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash
  ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires_at
  ON password_reset_tokens(expires_at);

COMMIT;
