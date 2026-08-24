/**
 * Module-level access-token store for the dashboard API layer.
 *
 * The access token is fetched at boot by {@link AuthProvider} and written
 * here so the plain `lib/api/*` fetch helpers (which have no React
 * context access) can attach `Authorization: Bearer <token>` to every
 * request. This mirrors the SDK's request-interceptor approach in
 * `xstreamroll-sdk/src/client.ts`.
 */

let accessToken: string | null = null

/** Record the current access token (or clear it by passing `null`). */
export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** Read the current access token; `null` when unauthenticated. */
export function getAccessToken(): string | null {
  return accessToken
}

/** Forget the access token (e.g. after a failed refresh). */
export function clearAccessToken(): void {
  accessToken = null
}
