import "server-only"
import { revalidateTag } from "next/cache"
import type { PaginatedResponse, Stream } from "@xstreamroll/types"
import { cached } from "./cached"
import {
  CACHE_TAGS,
  CACHE_TTL_SECONDS,
  streamDetailTag,
} from "./cache-config"

const DEFAULT_API_BASE = "http://localhost:3001"

function apiBase(): string {
  return (
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) ||
    process.env.API_URL ||
    DEFAULT_API_BASE
  )
}

export type StreamListResult = PaginatedResponse<Stream>

/**
 * Server-only stream fetchers wrapped in unstable_cache.
 *
 * The list query is cached against the `stream-list` tag with a 30s
 * TTL (per issue acceptance criteria). Individual stream detail
 * fetches are cached against a per-id `stream-detail:<id>` tag so a
 * mutation only has to bust the row it touched.
 *
 * Cache lifecycle:
 *
 *   - on stream create / delete / list-shape change → call
 *     `invalidateStreamList()` to drop the list cache.
 *   - on stream update → call `invalidateStreamDetail(id)` which also
 *     drops the list cache because the row's summary fields may have
 *     changed.
 */
export const getStreamList = cached(
  async (params: { page?: number; limit?: number } = {}) => {
    const url = new URL(`${apiBase()}/streams`)
    if (params.page) url.searchParams.set("page", String(params.page))
    if (params.limit) url.searchParams.set("limit", String(params.limit))

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) {
      throw new Error(`streams list responded ${res.status}`)
    }
    return (await res.json()) as StreamListResult
  },
  ["streams", "list"],
  {
    tags: [CACHE_TAGS.streamList],
    revalidate: CACHE_TTL_SECONDS.streamList,
    label: "streams.list",
  },
)

export async function getStreamDetail(id: number | string): Promise<Stream> {
  const fn = cached(
    async (streamId: string) => {
      const res = await fetch(`${apiBase()}/streams/${streamId}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
      if (!res.ok) {
        throw new Error(`stream detail responded ${res.status}`)
      }
      return (await res.json()) as Stream
    },
    ["streams", "detail", String(id)],
    {
      tags: [streamDetailTag(id), CACHE_TAGS.streamList],
      revalidate: CACHE_TTL_SECONDS.streamDetail,
      label: `streams.detail:${id}`,
    },
  )
  return fn(String(id))
}

/* --------------------------------------------------------------- *
 * Invalidation helpers — call these from Server Actions or Route
 * Handlers after mutating data so the next read sees fresh state.
 * --------------------------------------------------------------- */

// Next.js 16 requires a profile argument on revalidateTag; we use the
// "default" profile so the tag is purged immediately while still
// integrating with cacheLife() defaults if a future caller annotates
// their cached function with a custom profile.
const REVALIDATE_PROFILE = "default" as const

export function invalidateStreamList(): void {
  revalidateTag(CACHE_TAGS.streamList, REVALIDATE_PROFILE)
}

export function invalidateStreamDetail(id: number | string): void {
  revalidateTag(streamDetailTag(id), REVALIDATE_PROFILE)
  // The stream list contains the summary fields of every row, so any
  // detail mutation must also bust the list cache.
  revalidateTag(CACHE_TAGS.streamList, REVALIDATE_PROFILE)
}
