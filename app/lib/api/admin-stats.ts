/**
 * Shared types + fetch helpers for the admin stats endpoint.
 *
 * The shape mirrors the API contract in api/src/admin/admin-stats.service.ts:
 *   GET /admin/stats -> AdminStats
 */

export type { AdminStats } from "@xstreamroll/types"

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

export class AdminStatsError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "AdminStatsError"
  }
}

export async function fetchAdminStats(
  init: { signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<AdminStats> {
  const res = await fetch(`${resolveApiBase()}/admin/stats`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    signal: init.signal,
    // No browser-level caching — the API already enforces a 60s TTL.
    cache: "no-store",
  })

  if (!res.ok) {
    throw new AdminStatsError(res.status, `admin/stats responded ${res.status}`)
  }
  return (await res.json()) as AdminStats
}
