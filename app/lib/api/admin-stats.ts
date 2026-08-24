/**
 * Shared types + fetch helpers for the admin stats endpoint.
 *
 * The shape mirrors the API contract in api/src/admin/admin-stats.service.ts:
 *   GET /admin/stats -> AdminStats
 *
 * Requests route through {@link fetchJson}, which attaches the access
 * token (`Authorization: Bearer <jwt>`) and handles a 401 by refreshing
 * the token once and retrying (issue #518).
 */

import { ApiRequestError, fetchJson } from "./fetch-json"

export interface AdminStats {
  totalUsers: number
  totalStreams: number
  activeStreams: number
  eventsLast24h: number
  generatedAt: string
}

const DEFAULT_API_BASE = "http://localhost:3001"

function resolveApiBase(): string {
  // Prefer the public env var so the same code runs in the browser; fall
  // back to the dev default. The server bundle also has access to
  // process.env.API_URL for SSR data fetching but for this dashboard
  // page everything happens client-side.
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  return DEFAULT_API_BASE
}

export class AdminStatsError extends ApiRequestError {}

export async function fetchAdminStats(
  init: { signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<AdminStats> {
  return fetchJson<AdminStats>(
    `${resolveApiBase()}/admin/stats`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: init.signal,
      // No browser-level caching — the API already enforces a 60s TTL.
      cache: "no-store",
    },
    AdminStatsError,
  )
}
