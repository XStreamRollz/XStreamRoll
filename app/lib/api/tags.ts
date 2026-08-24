/**
 * Client helpers for the tags API.
 *
 *   GET    /tags                            -> PagedTags
 *   POST   /streams/:id/tags  { name }      -> Tag
 *   DELETE /streams/:id/tags/:tagId         -> 204
 *
 * All requests route through {@link fetchJson}, which attaches the
 * access token (`Authorization: Bearer <jwt>`) and handles a 401 by
 * refreshing the token once and retrying (issue #518).
 */

import { ApiRequestError, fetchJson } from "./fetch-json"

export interface Tag {
  id: number
  name: string
  slug: string
  createdAt: string
}

/**
 * Paginated tags response. Mirrors the wire shape from the API's
 * `TagsService.list`, which uses `data` (matching
 * {@link PaginatedResponse}) — not `items`.
 */
export interface PagedTags {
  data: Tag[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

const DEFAULT_API_BASE = "http://localhost:3001"

function apiBase(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  return DEFAULT_API_BASE
}

export class TagsApiError extends ApiRequestError {}

export async function listTags(
  params: { page?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<PagedTags> {
  const url = new URL(`${apiBase()}/tags`)
  if (params.page) url.searchParams.set("page", String(params.page))
  if (params.limit) url.searchParams.set("limit", String(params.limit))

  return fetchJson<PagedTags>(
    url.toString(),
    {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: params.signal,
      cache: "no-store",
    },
    TagsApiError,
  )
}

export async function attachTagToStream(
  streamId: number,
  name: string,
  init: { signal?: AbortSignal } = {},
): Promise<Tag> {
  return fetchJson<Tag>(
    `${apiBase()}/streams/${streamId}/tags`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name }),
      signal: init.signal,
    },
    TagsApiError,
  )
}

export async function detachTagFromStream(
  streamId: number,
  tagId: number,
  init: { signal?: AbortSignal } = {},
): Promise<void> {
  await fetchJson<void>(
    `${apiBase()}/streams/${streamId}/tags/${tagId}`,
    {
      method: "DELETE",
      headers: { Accept: "application/json" },
      signal: init.signal,
    },
    TagsApiError,
  )
}
