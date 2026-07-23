import type { Metadata } from "next"
import { Suspense } from "react"
import { StreamListSkeleton } from "@/components/dashboard/stream-list-skeleton"
import { LiveStreamStatusBadge } from "@/components/streams/live-stream-status-badge"
import { StreamTagEditor } from "./stream-tag-editor"

export const metadata: Metadata = {
  title: "Streams | XStreamRoll",
  description: "Manage your streams and their tags.",
}

export const dynamic = "force-dynamic"

/**
 * Streams dashboard page. The list body is wrapped in `<Suspense>` so
 * the `<StreamListSkeleton>` flows as the loading UI whenever the
 * underlying data load suspends (#369). Today the editor renders
 * synchronously with demo data; once the real data layer is wired up,
 * the surrounding Suspense boundary will surface the skeleton
 * automatically without further changes to this file.
 */
export default function StreamsDashboardPage() {
  const demoStreamId = 1
  const demoUserId = 1

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Stream tags</h1>
          <LiveStreamStatusBadge streamId={demoStreamId} initialStatus="inactive" />
        </div>
        <p className="text-sm text-muted-foreground">
          Manage the tags attached to your stream. Changes are saved as you go.
        </p>
      </header>
      <Suspense fallback={<StreamListSkeleton />}>
        <StreamTagEditor
          streamId={demoStreamId}
          initialTags={[]}
          actingUserId={demoUserId}
        />
      </Suspense>
    </main>
  )
}
