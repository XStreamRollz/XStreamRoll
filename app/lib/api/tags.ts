/**
 * Client helpers for the tags API.
 *
 *   GET    /tags                            -> PagedTags
 *   POST   /streams/:id/tags  { name }      -> Tag
 *   DELETE /streams/:id/tags/:tagId         -> 204
 */

export interface Tag {
  id: number
  name: string
  slug: string
  createdAt: string
}

export interface PagedTags {
  items: Tag[]
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

export class TagsApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "TagsApiError"
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

export async function listTags(
  params: { page?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<PagedTags> {
  const url = new URL(`${apiBase()}/tags`)
  if (params.page) url.searchParams.set("page", String(params.page))
  if (params.limit) url.searchParams.set("limit", String(params.limit))

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: params.signal,
    cache: "no-store",
  })
  if (!res.ok) throw new TagsApiError(res.status, await readError(res))
  return (await res.json()) as PagedTags
}

export async function attachTagToStream(
  streamId: number,
  name: string,
  init: { userId?: string | number; signal?: AbortSignal } = {},
): Promise<Tag> {
  const res = await fetch(`${apiBase()}/streams/${streamId}/tags`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.userId !== undefined ? { "X-User-Id": String(init.userId) } : {}),
    },
    body: JSON.stringify({ name }),
    signal: init.signal,
  })
  if (!res.ok) throw new TagsApiError(res.status, await readError(res))
  return (await res.json()) as Tag
}

export async function detachTagFromStream(
  streamId: number,
  tagId: number,
  init: { userId?: string | number; signal?: AbortSignal } = {},
): Promise<void> {
  const res = await fetch(`${apiBase()}/streams/${streamId}/tags/${tagId}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      ...(init.userId !== undefined ? { "X-User-Id": String(init.userId) } : {}),
    },
    signal: init.signal,
  })
  if (!res.ok) throw new TagsApiError(res.status, await readError(res))
}
