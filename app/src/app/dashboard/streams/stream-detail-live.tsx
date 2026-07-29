"use client"

import { useStreamDetail } from "@/hooks/useStreams"

export function StreamDetailLive({ publicId }: { publicId: string }) {
  const { data, isLoading, isError, error } = useStreamDetail(publicId)

  if (isLoading) return null
  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Failed to load stream: {error?.message ?? "unknown error"}
      </p>
    )
  }
  if (!data) return null

  return (
    <section className="mt-6 rounded-md border p-4">
      <h2 className="text-lg font-semibold">{data.name}</h2>
      {data.description && (
        <p className="text-sm text-muted-foreground">{data.description}</p>
      )}
      <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
        status: {data.status}
      </p>
      {data.tags && data.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {data.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded bg-secondary px-2 py-0.5 text-xs"
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
