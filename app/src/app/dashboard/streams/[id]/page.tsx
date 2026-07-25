import type { Metadata } from "next"
import { Suspense } from "react"
import { StreamDetailSkeleton } from "@/components/dashboard/stream-detail-skeleton"
import { EmbedSnippet } from "@/components/streams/embed-snippet"
import { LiveStreamStatusBadge } from "@/components/streams/live-stream-status-badge"

export const metadata: Metadata = {
  title: "Stream | XStreamRoll",
  description: "Stream details and embed snippet.",
}

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Stream detail page.
 *
 * The dashboard renders this page when a user opens one of their
 * streams. It shows the stream metadata and — per issue 95 — a
 * copy-to-clipboard iframe embed snippet.
 *
 * The route param `id` here is the stream's PUBLIC identifier. The
 * private/secret stream key MUST NOT be passed into this page so the
 * embed snippet stays safe to share with third-party sites.
 *
 * The embed snippet is wrapped in `<Suspense>` so the skeleton is
 * streamed while per-stream data resolves (#369).
 */
export default async function StreamDetailPage({ params }: PageProps) {
  const { id: publicId } = await params

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Stream {publicId}</h1>
          <LiveStreamStatusBadge streamId={publicId} initialStatus="inactive" />
        </div>
        <p className="text-sm text-muted-foreground">
          Share this stream by embedding it on any site.
        </p>
      </header>

      <Suspense fallback={<StreamDetailSkeleton />}>
        <EmbedSnippet publicId={publicId} />
      </Suspense>
    </main>
  )
}
