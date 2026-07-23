/**
 * Client-side adapters for the streams API.
 *
 *   GET    /streams              -> PaginatedResponse<Stream>
 *   GET    /streams/:id          -> Stream
 *   POST   /streams              -> Stream  (create)
 *   PATCH  /streams/:id          -> Stream  (update)
 *   DELETE /streams/:id          -> 204     (delete)
 *
 * Kept deliberately tiny — React Query is the right place to add
 * caching, dedupe, and background refetch behaviour, so this module
 * intentionally returns raw fetch responses only.
 */
import type { PaginatedResponse, Stream } from "@xstreamroll/types"

const DEFAULT_API_BASE = "http://localhost:3001"

function apiBase(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  return DEFAULT_API_BASE
}

export class StreamsApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "StreamsApiError"
  }
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

export interface StreamListParams {
  page?: number
  limit?: number
  status?: string
  signal?: AbortSignal
}

/**
 * Wire response shape: the API additionally returns a `hasMore`
 * boolean computed from `page * limit < total`. Kept as an additive
 * property on the typed return so consumers that care can read it
 * without losing type-safety on the core pagination fields.
 */
export type StreamsListPage = PaginatedResponse<Stream> & { hasMore: boolean }

export async function listStreams(
  params: StreamListParams = {},
): Promise<StreamsListPage> {
  const url = new URL(`${apiBase()}/streams`)
  if (params.page) url.searchParams.set("page", String(params.page))
  if (params.limit) url.searchParams.set("limit", String(params.limit))
  if (params.status) url.searchParams.set("status", params.status)

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: params.signal,
  })
  if (!res.ok) throw new StreamsApiError(res.status, await readError(res))
  return (await res.json()) as StreamsListPage
}

export async function getStream(
  id: string,
  init: { signal?: AbortSignal } = {},
): Promise<Stream> {
  const res = await fetch(`${apiBase()}/streams/${id}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: init.signal,
  })
  if (!res.ok) throw new StreamsApiError(res.status, await readError(res))
  return (await res.json()) as Stream
}
