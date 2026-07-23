"use client"

import { useStreamList } from "@/hooks/useStreams"
import { StreamListSkeleton } from "@/components/dashboard/stream-list-skeleton"

/**
 * Client component rendering the streams list using React Query.
 * Falls back to the stream-list skeleton during the loading state so
 * the dashboard never flashes empty (issue #345).
 */
export function StreamsListLive() {
  const { data, isLoading, isError, error } = useStreamList({ page: 1, limit: 20 })

  if (isLoading) return <StreamListSkeleton />
  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Failed to load streams: {error?.message ?? "unknown error"}
      </p>
    )
  }

  const streams = data?.data ?? []
  if (streams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No streams yet. Create one from the &quot;New stream&quot; page.
      </p>
    )
  }

  return (
    <ul className="mb-6 divide-y rounded-md border">
      {streams.map((stream) => (
        <li key={stream.id} className="flex flex-col gap-1 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">{stream.name}</span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {stream.status}
            </span>
          </div>
          {stream.description && (
            <p className="text-sm text-muted-foreground">
              {stream.description}
            </p>
          )}
          {stream.tags && stream.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {stream.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded bg-secondary px-2 py-0.5 text-xs"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
