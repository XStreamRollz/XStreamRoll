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
 * Only actions that are actually recorded may appear here — an action
 * that documents an interceptor capture for a route that does not exist
 * is dead vocabulary (issue #523).
 *
 * @see database/migrations/2026072801_add_audit_log_metadata_and_index.up.sql
 */
export enum AuditAction {
  // ── Authentication (service-level, written by AuthService) ─────────
  AUTH_LOGIN_SUCCESS = "AUTH_LOGIN_SUCCESS",
  AUTH_LOGIN_FAILURE = "AUTH_LOGIN_FAILURE",
  AUTH_REGISTER_SUCCESS = "AUTH_REGISTER_SUCCESS",
  AUTH_REGISTER_FAILURE = "AUTH_REGISTER_FAILURE",

  // ── Generic interceptor-captured actions ─────────────────────────
  /** Captured by AuditInterceptor on PATCH /users/me */
  PROFILE_UPDATE = "profile_update",
  /** Captured by AuditInterceptor on POST /users/me/change-password */
  PASSWORD_CHANGE = "password_change",
  /** Captured by AuditInterceptor on DELETE /streams/:id */
  STREAM_DELETE = "stream_delete",
}
