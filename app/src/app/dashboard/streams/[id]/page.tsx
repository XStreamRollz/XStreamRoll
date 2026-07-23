import type { Metadata } from "next"
import { Suspense } from "react"
import { StreamDetailSkeleton } from "@/components/dashboard/stream-detail-skeleton"
import { EmbedSnippet } from "@/components/streams/embed-snippet"
import { StreamDetailLive } from "../stream-detail-live"

export const metadata: Metadata = {
  title: "Stream | XStreamRoll",
  description: "Stream details and embed snippet.",
}

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Stream detail page. Wraps a client component
 * ({@link StreamDetailLive}) that consumes `useStreamDetail` so the
 * metadata roundtrips through React Query's 30s stale-while-revalidate
 * cache (issue #345 phase B).
 */
export default async function StreamDetailPage({ params }: PageProps) {
  const { id: publicId } = await params

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Stream {publicId}</h1>
        <p className="text-sm text-muted-foreground">
          Share this stream by embedding it on any site.
        </p>
      </header>

      <Suspense fallback={<StreamDetailSkeleton />}>
        <EmbedSnippet publicId={publicId} />
        <StreamDetailLive publicId={publicId} />
      </Suspense>
    </main>
  )
}
