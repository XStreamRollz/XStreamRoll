"use server-only" // not actually server-only -- client-readable; comment clarifies imports.

/**
 * Client helpers for the streams API. Used by `app/hooks/useStreams.ts`
 * to back {@link useStreamList}, {@link useStreamDetail},
 * {@link useAttachTag}, and {@link useDetachTag}.
 *
 *   GET    /streams?page=&limit=             -> PaginatedResponse<Stream>
 *   GET    /streams/:id                      -> Stream
 *   POST   /streams/:id/tags   { name }     -> Tag
 *   DELETE /streams/:id/tags/:tagId          -> 204
 *
 * All requests route through {@link fetchJson}, which attaches the
 * access token (`Authorization: Bearer <jwt>`) and handles a 401 by
 * refreshing the token once and retrying (issue #518).
 */

import { ApiRequestError, fetchJson } from "./fetch-json"

import type { PaginatedResponse, Stream } from "@xstreamroll/types"

export interface PaginatedStreams {
  data: Stream[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

export class StreamsApiError extends ApiRequestError {}

const DEFAULT_API_BASE = "http://localhost:3001"

function apiBase(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  return DEFAULT_API_BASE
}

export async function listStreams(
  params: {
    page?: number
    limit?: number
    /** Case-insensitive name/description search (issue #532). */
    q?: string
    /** Tag slug or id to filter by (issue #532). */
    tag?: string
    signal?: AbortSignal
  } = {},
): Promise<PaginatedStreams> {
  const url = new URL(`${apiBase()}/streams`)
  if (params.page) url.searchParams.set("page", String(params.page))
  if (params.limit) url.searchParams.set("limit", String(params.limit))
  if (params.q) url.searchParams.set("q", params.q)
  if (params.tag) url.searchParams.set("tag", params.tag)

  const json = await fetchJson<
    | PaginatedResponse<Stream>
    | (Omit<PaginatedStreams, "data"> & { data: Stream[] })
  >(
    url.toString(),
    {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: params.signal,
      credentials: "include",
    },
    StreamsApiError,
  )
  // The API's list endpoint serialises `data` as an array of stream
  // summaries (wire shape from @xstreamroll/types#Stream).
  return {
    data: (json as { data: Stream[] }).data,
    page: (json as { page: number }).page,
    limit: (json as { limit: number }).limit,
    total: (json as { total: number }).total,
    hasMore: (json as { hasMore: boolean }).hasMore,
  }
}

export async function getStream(
  id: string | number,
  init: { signal?: AbortSignal } = {},
): Promise<Stream> {
  return fetchJson<Stream>(
    `${apiBase()}/streams/${id}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: init.signal,
      credentials: "include",
    },
    StreamsApiError,
  )
}
