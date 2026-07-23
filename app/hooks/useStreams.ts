"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query"
import type { Stream } from "@xstreamroll/types"
import {
  attachTagToStream,
  detachTagFromStream,
  type Tag,
} from "@/lib/api/tags"
import {
  getStream,
  listStreams,
  type StreamListParams,
  type StreamsListPage,
} from "@/lib/api/streams"

/**
 * Stream + tag React Query hooks (issue #345).
 *
 * The query keys are stable across renders:
 *   - `["streams", "list", paramsHash]` for the paginated list.
 *   - `["streams", "detail", id]` for a single stream.
 *   - `["streams", "tags", streamId]` for the tag set attached to a
 *     given stream. The dashboard's StreamTagEditor reads from and
 *     mutates this key.
 */

const STREAMS_LIST_STALE_MS = 30 * 1000 // #345 AC: 30-second SWR window.

export const streamsQueryKeys = {
  all: ["streams"] as const,
  list: (params: StreamListParams) =>
    ["streams", "list", JSON.stringify(params ?? {})] as const,
  detail: (id: string) => ["streams", "detail", id] as const,
  tags: (streamId: number | string) =>
    ["streams", "tags", String(streamId)] as const,
}

export function useStreamsList(
  params: StreamListParams = {},
  options: Omit<
    UseQueryOptions<StreamsListPage>,
    "queryKey" | "queryFn"
  > = {},
) {
  return useQuery<StreamsListPage>({
    queryKey: streamsQueryKeys.list(params),
    queryFn: ({ signal }) => listStreams({ ...params, signal }),
    staleTime: STREAMS_LIST_STALE_MS,
    ...options,
  })
}

export function useStreamDetail(
  id: string | number | null | undefined,
  options: Omit<
    UseQueryOptions<Stream>,
    "queryKey" | "queryFn"
  > = {},
) {
  // `enabled` defaults to "only fetch when we have an id"; callers can
  // override it via options.enabled if they have a more specific gating
  // reason (e.g. ownership check still loading).
  const enabled =
    options.enabled !== undefined ? options.enabled : id !== null && id !== undefined
  const key = id !== null && id !== undefined ? String(id) : "pending"

  return useQuery<Stream>({
    queryKey: streamsQueryKeys.detail(key),
    queryFn: ({ signal }) => getStream(key, { signal }),
    enabled,
    ...options,
  })
}

/** Single source of truth for the attached-tag set on a stream. */
export function useStreamTags(
  streamId: number | string,
  initialTags: Tag[] = [],
) {
  return useQuery<Tag[]>({
    queryKey: streamsQueryKeys.tags(streamId),
    queryFn: async () => initialTags, // Server-provided by default.
    initialData: initialTags,
    staleTime: STREAMS_LIST_STALE_MS,
  })
}

// --------------------------------------------------------------------
// Mutations: attach / detach — both optimistically update the
// `["streams","tags","<id>"]` cache key so the editor feels instant.
//
// Implementation note: each mutation captures the placeholder Tag in
// its `onMutate` context so `onSuccess` / `onError` can replace it by
// exact reference rather than by fragile name equality. The placeholder
// id is also drawn from a monotonically-incrementing counter to avoid
// `Date.now()` collisions between concurrent attaches (issue #345).
// --------------------------------------------------------------------

let placeholderSeq = 0

export interface AttachTagInput {
  streamId: number | string
  name: string
  userId?: string | number
}

export interface AttachMutationContext {
  previous: Tag[] | undefined
  placeholder: Tag
}

export function useAttachStreamTag(
  options: Pick<
    UseMutationOptions<Tag, Error, AttachTagInput, AttachMutationContext>,
    "onSuccess" | "onError" | "onSettled"
  > = {},
) {
  const queryClient = useQueryClient()
  // Narrow the consumer-provided callbacks to the one-arg form that
  // most callers actually use. TanStack Query v5 declares
  // `onError`/onSuccess as 4-arg functions but exposes only the
  // payload to the consumer (the rest is for internal mutation
  // bookkeeping), so calling with the single-arg shape is safe and
  // removes the "Expected 4 arguments, but got 3" typecheck error.
  const userOnError = options.onError as ((err: Error) => void) | undefined
  const userOnSuccess = options.onSuccess as ((tag: Tag) => void) | undefined
  return useMutation<Tag, Error, AttachTagInput, AttachMutationContext>({
    mutationFn: ({ streamId, name, userId }) =>
      attachTagToStream(streamId as number, name, { userId }),
    onMutate: async ({ streamId, name }) => {
      const key = streamsQueryKeys.tags(streamId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Tag[]>(key)
      const placeholder: Tag = {
        id: --placeholderSeq,
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        createdAt: new Date().toISOString(),
      }
      queryClient.setQueryData<Tag[]>(key, (prev) => [
        ...(prev ?? []),
        placeholder,
      ])
      return { previous, placeholder }
    },
    onError: (err, { streamId }, ctx) => {
      // Always roll back before notifying the consumer so the toast
      // fires against the restored cache state, not the transient
      // optimistic one.
      if (ctx?.previous) {
        queryClient.setQueryData(streamsQueryKeys.tags(streamId), ctx.previous)
      }
      userOnError?.(err)
    },
    onSuccess: (tag, { streamId }, ctx) => {
      // Replace the optimistic placeholder by reference. The cache may
      // contain interleaved state from concurrent mutations; using
      // `===` keeps the swap surgical.
      queryClient.setQueryData<Tag[]>(streamsQueryKeys.tags(streamId), (prev) =>
        (prev ?? []).map((t) => (t === ctx?.placeholder ? tag : t)),
      )
      userOnSuccess?.(tag)
    },
  })
}

export interface DetachTagInput {
  streamId: number | string
  tagId: number
  userId?: string | number
}

export function useDetachStreamTag(
  options: Pick<
    UseMutationOptions<void, Error, DetachTagInput, { previous: Tag[] | undefined }>,
    "onSuccess" | "onError" | "onSettled"
  > = {},
) {
  const queryClient = useQueryClient()
  const userOnError = options.onError as ((err: Error) => void) | undefined
  const userOnSuccess = options.onSuccess as (() => void) | undefined
  return useMutation<
    void,
    Error,
    DetachTagInput,
    { previous: Tag[] | undefined }
  >({
    mutationFn: ({ streamId, tagId, userId }) =>
      detachTagFromStream(streamId as number, tagId, { userId }),
    onMutate: async ({ streamId, tagId }) => {
      const key = streamsQueryKeys.tags(streamId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Tag[]>(key)
      queryClient.setQueryData<Tag[]>(key, (prev) =>
        (prev ?? []).filter((t) => t.id !== tagId),
      )
      return { previous }
    },
    onError: (err, { streamId }, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(streamsQueryKeys.tags(streamId), ctx.previous)
      }
      userOnError?.(err)
    },
    onSuccess: () => {
      userOnSuccess?.()
    },
  })
}
