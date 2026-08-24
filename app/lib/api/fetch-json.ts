/**
 * Shared fetch wrapper for the dashboard API layer (issue #518).
 *
 * Every `lib/api/*` helper routes its requests through {@link fetchJson}
 * so that:
 *
 *   1. `Authorization: Bearer <accessToken>` is attached whenever a token
 *      is available (the store is populated by `AuthProvider` at boot),
 *   2. a 401 response triggers exactly one token refresh
 *      (`POST /api/auth/refresh`, the app's own route) and one retry of
 *      the failed request — matching the SDK's `requestJson` behaviour in
 *      `xstreamroll-sdk/src/client.ts`,
 *   3. if the refresh fails, the user is redirected to `/auth/login`.
 *
 * Non-2xx responses throw {@link ApiRequestError}; callers may pass their
 * own error subclass as the third argument to keep `instanceof` checks
 * working.
 */

import { clearAccessToken, getAccessToken, setAccessToken } from "./token-store"

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiRequestError"
  }
}

const LOGIN_PATH = "/auth/login"

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string }
    if (typeof body.message === "string") return body.message
  } catch {
    /* ignore */
  }
  return `request failed with ${res.status}`
}

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch("/api/auth/refresh", { method: "POST" })
  if (!res.ok) return null
  const data = (await res.json()) as { accessToken?: string }
  if (typeof data.accessToken !== "string" || data.accessToken === "") {
    return null
  }
  setAccessToken(data.accessToken)
  return data.accessToken
}

function redirectToLogin(): void {
  if (typeof window !== "undefined") {
    window.location.assign(LOGIN_PATH)
  }
}

export interface FetchJsonInit extends RequestInit {
  /** Skip the 401-refresh-retry cycle (e.g. auth endpoints themselves). */
  skipAuthRefresh?: boolean
}

/**
 * Fetch a JSON resource with the shared auth wiring.
 *
 * @param url        The request URL.
 * @param init       Standard `RequestInit` plus `skipAuthRefresh`.
 * @param ErrorClass Error constructor used for non-2xx responses; the
 *                   module's own `*ApiError` class keeps `instanceof`
 *                   checks working.
 */
export async function fetchJson<T>(
  url: string,
  init: FetchJsonInit = {},
  ErrorClass: new (status: number, message: string) => ApiRequestError = ApiRequestError,
): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getAccessToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)

  let res = await fetch(url, { ...init, headers })

  if (res.status === 401 && !init.skipAuthRefresh) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      // One retry with the fresh token.
      const retryHeaders = new Headers(init.headers)
      retryHeaders.set("Authorization", `Bearer ${refreshed}`)
      res = await fetch(url, { ...init, headers: retryHeaders })
    } else {
      clearAccessToken()
      redirectToLogin()
      throw new ErrorClass(res.status, "session expired")
    }
  }

  if (!res.ok) {
    throw new ErrorClass(res.status, await readError(res))
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}
