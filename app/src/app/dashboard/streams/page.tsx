import type { Metadata } from "next"
import { StreamTagEditor } from "./stream-tag-editor"

export const metadata: Metadata = {
  title: "Streams | XStreamRoll",
  description: "Manage your streams and their tags.",
}

export const dynamic = "force-dynamic"

/**
 * Streams dashboard page. The real implementation will list every
 * stream owned by the current user; this scaffold focuses on the
 * issue-100 acceptance criteria: a working tag editor that is wired
 * end-to-end against the tags API.
 *
 * Replace `demoStreamId` and `demoUserId` with real values once the
 * data fetching + auth layers are available.
 */
export default function StreamsDashboardPage() {
  const demoStreamId = 1
  const demoUserId = 1

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Stream tags</h1>
        <p className="text-sm text-muted-foreground">
          Manage the tags attached to your stream. Changes are saved as you go.
        </p>
      </header>
      <StreamTagEditor
        streamId={demoStreamId}
        initialTags={[]}
        actingUserId={demoUserId}
      />
    </main>
  )
}
