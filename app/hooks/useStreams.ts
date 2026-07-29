"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"
import type { Stream } from "@xstreamroll/types"
import {
  attachTagToStream,
  detachTagFromStream,
  type PagedTags,
  type Tag,
} from "@/lib/api/tags"
import {
  getStream,
  listStreams,
  type PaginatedStreams,
} from "@/lib/api/streams"

/**
 * Centralised query-key factory — pins every cache key the hooks
 * below read / write to so invalidations stay typed.
 *
 *   useStreamList.all    -> ["streams", "list", page, limit]
 *   useStreamDetail.all  -> ["streams", "detail", id]
 *   useStreamTags.all    -> ["streams", "detail", String(id), "tags"]
 */
export const streamKeys = {
  all: ["streams"] as const,
  lists: () => [...streamKeys.all, "list"] as const,
  list: (page: number, limit: number) =>
    [...streamKeys.lists(), page, limit] as const,
  details: () => [...streamKeys.all, "detail"] as const,
  detail: (id: string | number) =>
    [...streamKeys.details(), String(id)] as const,
  tags: (id: string | number) =>
    [...streamKeys.detail(id), "tags"] as const,
}

const DEFAULT_STALE_MS = 30_000

/**
 * Fetches the paginated streams list with React Query's default 30s
 * stale-while-revalidate window (matches `lib/cache/cache-config.ts`).
 */
export function useStreamList(
  params: { page?: number; limit?: number } = {},
): UseQueryResult<PaginatedStreams, Error> {
  const page = params.page ?? 1
  const limit = params.limit ?? 20
  return useQuery({
    queryKey: streamKeys.list(page, limit),
    queryFn: ({ signal }) => listStreams({ page, limit, signal }),
    staleTime: DEFAULT_STALE_MS,
  })
}

export function useStreamDetail(
  id: string | number | undefined,
): UseQueryResult<Stream, Error> {
  return useQuery({
    queryKey: id ? streamKeys.detail(id) : ["streams", "detail", "__none__"],
    queryFn: ({ signal }) => {
      if (!id) throw new Error("useStreamDetail requires a stream id")
      return getStream(id, { signal })
    },
    enabled: id !== undefined,
    staleTime: DEFAULT_STALE_MS,
  })
}

export function useStreamTags(
  id: string | number | undefined,
): UseQueryResult<PagedTags, Error> {
  return useQuery({
    queryKey: id ? streamKeys.tags(id) : ["streams", "tags", "__none__"],
    queryFn: ({ signal }) => {
      if (!id) throw new Error("useStreamTags requires a stream id")
      const url = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/streams/${id}/tags`
      return fetch(url, {
        credentials: "include",
        signal,
        headers: { Accept: "application/json" },
      }).then(async (res) => {
        if (!res.ok) throw new Error(`stream tags responded ${res.status}`)
        return (await res.json()) as PagedTags
      })
    },
    enabled: id !== undefined,
    staleTime: DEFAULT_STALE_MS,
  })
}

export interface TagMutationContext {
  previousTags: PagedTags | undefined
}

function emptyPagedTags(): PagedTags {
  return { data: [], page: 1, limit: 50, total: 0, hasMore: false }
}

/**
 * Attach a tag to a stream with an optimistic update. The list under
 * `streamKeys.tags(streamId)` is updated pessimistically-then-
 * confirmed so the chips flip into place before the server replies;
 * on error the cache is rolled back to `previousTags`.
 */
export function useAttachTag(
  streamId: string | number,
): UseMutationResult<Tag, Error, { name: string }, TagMutationContext> {
  const qc = useQueryClient()
  const tagsKey = streamKeys.tags(streamId)
  // The local tags API uses numeric ids (matches the NestJS controller's
  // ParseIntPipe) so coerce string ids (from URL params) at the boundary.
  const numericStreamId = typeof streamId === "string" ? Number(streamId) : streamId
  return useMutation<Tag, Error, { name: string }, TagMutationContext>({
    mutationFn: ({ name }) =>
      attachTagToStream(numericStreamId, name, { signal: undefined }),
    onMutate: async ({ name }) => {
      const previousTags = qc.getQueryData<PagedTags>(tagsKey)
      // Seed a base shape so the placeholder array reference below
      // triggers a consumer re-render rather than mutating an undefined.
      qc.setQueryData<PagedTags>(tagsKey, (current) => ({
        ...(current ?? emptyPagedTags()),
        data: current?.data ?? [],
      }))
      // Optimistic placeholder: a synthetic Tag with a negative id so
      // the UI renders a chip immediately. The real id arrives with
      // the mutation response and replaces it via onSuccess. Negative
      // ids are unambiguously placeholders and stay stable per name.
      const placeholder: Tag = {
        id: -Math.abs([...name].reduce((acc, c) => acc + c.charCodeAt(0), 0)),
        name,
        slug: name,
        createdAt: new Date().toISOString(),
      }
      qc.setQueryData<PagedTags>(tagsKey, (current) => ({
        ...(current ?? emptyPagedTags()),
        data: [...(current?.data ?? []), placeholder],
      }))
      return { previousTags }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousTags !== undefined) {
        qc.setQueryData(tagsKey, ctx.previousTags)
      }
    },
    onSuccess: (created) => {
      qc.setQueryData<PagedTags>(tagsKey, (current) => {
        const data = (current?.data ?? []).map((t) =>
          t.id < 0 && t.name === created.name ? created : t,
        )
        return {
          ...(current ?? emptyPagedTags()),
          data,
        }
      })
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: streamKeys.detail(streamId) })
    },
  })
}

/**
 * Detach a tag from a stream with an optimistic update.
 */
export function useDetachTag(
  streamId: string | number,
): UseMutationResult<void, Error, { tagId: string | number }, TagMutationContext> {
  const qc = useQueryClient()
  const tagsKey = streamKeys.tags(streamId)
  const numericStreamId = typeof streamId === "string" ? Number(streamId) : streamId
  return useMutation({
    mutationFn: ({ tagId }) =>
      detachTagFromStream(numericStreamId, Number(tagId), { signal: undefined }),
    onMutate: async ({ tagId }) => {
      const previousTags = qc.getQueryData<PagedTags>(tagsKey)
      qc.setQueryData<PagedTags>(tagsKey, (current) => {
        const base = current ?? emptyPagedTags()
        return { ...base, data: base.data.filter((t) => t.id !== Number(tagId)) }
      })
      return { previousTags }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousTags !== undefined) {
        qc.setQueryData(tagsKey, ctx.previousTags)
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: streamKeys.detail(streamId) })
    },
  })
}
