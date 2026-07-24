import type { Metadata } from "next"
import { Suspense } from "react"
import { StreamListSkeleton } from "@/components/dashboard/stream-list-skeleton"
import { StreamTagEditor } from "./stream-tag-editor"
import { StreamsListLive } from "./streams-list-live"

export const metadata: Metadata = {
  title: "Streams | XStreamRoll",
  description: "Manage your streams and their tags.",
}

export const dynamic = "force-dynamic"

/**
 * Streams dashboard page. The list body is wrapped in `<Suspense>` so
 * the `<StreamListSkeleton>` flows as the loading UI whenever the
 * underlying data load suspends (#369).
 *
 * Issue #345 phase B: the actual list body now lives in a client
 * component that consumes {@link useStreamList} for React Query's
 * 30-second stale-while-revalidate window.
 */
export default function StreamsDashboardPage() {
  const demoStreamId = 1
  const demoUserId = 1

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Streams</h1>
        <p className="text-sm text-muted-foreground">
          Manage your streams and their tags. Changes are saved as you go.
        </p>
      </header>
      <Suspense fallback={<StreamListSkeleton />}>
        <StreamsListLive />
        <StreamTagEditor
          streamId={demoStreamId}
          initialTags={[]}
          actingUserId={demoUserId}
        />
      </Suspense>
    </main>
  )
}
