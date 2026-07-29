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
 */

import type { PaginatedResponse, Stream } from "@xstreamroll/types"

export interface PaginatedStreams {
  data: Stream[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

export class StreamsApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "StreamsApiError"
  }
}

const DEFAULT_API_BASE = "http://localhost:3001"

function apiBase(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  return DEFAULT_API_BASE
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string }
    if (typeof body.message === "string") return body.message
  } catch {
    /* ignore */
  }
  return `request failed with ${res.status}`
}

export async function listStreams(
  params: { page?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<PaginatedStreams> {
  const url = new URL(`${apiBase()}/streams`)
  if (params.page) url.searchParams.set("page", String(params.page))
  if (params.limit) url.searchParams.set("limit", String(params.limit))

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: params.signal,
    credentials: "include",
  })
  if (!res.ok) {
    throw new StreamsApiError(res.status, await readError(res))
  }
  // The API's list endpoint serialises `data` as an array of stream
  // summaries (wire shape from @xstreamroll/types#Stream).
  const json = (await res.json()) as
    | PaginatedResponse<Stream>
    | (Omit<PaginatedStreams, "data"> & { data: Stream[] })
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
  const res = await fetch(`${apiBase()}/streams/${id}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: init.signal,
    credentials: "include",
  })
  if (!res.ok) {
    throw new StreamsApiError(res.status, await readError(res))
  }
  return (await res.json()) as Stream
}
