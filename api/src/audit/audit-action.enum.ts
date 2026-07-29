/**
 * Enumeration of every audit-log action the application can record.
 *
 * Using a closed enum instead of free-form strings ensures:
 *   1. All callers agree on the exact value that lands in the DB.
 *   2. The `action` column can be indexed efficiently (no embedded
 *      dynamic data like email addresses).
 *   3. Variable context (email, username, reason …) is stored
 *      separately in the `metadata` JSONB column.
 *
 * @see database/migrations/2026072801_add_audit_log_metadata_and_index.up.sql
 */
export enum AuditAction {
  // ── Authentication ────────────────────────────────────────────────
  AUTH_LOGIN_SUCCESS = "AUTH_LOGIN_SUCCESS",
  AUTH_LOGIN_FAILURE = "AUTH_LOGIN_FAILURE",
  AUTH_REGISTER_SUCCESS = "AUTH_REGISTER_SUCCESS",
  AUTH_REGISTER_FAILURE = "AUTH_REGISTER_FAILURE",

  // ── Generic interceptor-captured actions ─────────────────────────
  /** Captured by AuditInterceptor on POST /auth/login */
  LOGIN = "login",
  PASSWORD_CHANGE = "password_change",
  STREAM_DELETE = "stream_delete",
  ROLE_CHANGE = "role_change",
  PROFILE_UPDATE = "profile_update",

  // ── User lifecycle ────────────────────────────────────────────────
  /** Captured when a user soft-deletes their account (issue #344). */
  USER_DELETED = "user_deleted",
}
