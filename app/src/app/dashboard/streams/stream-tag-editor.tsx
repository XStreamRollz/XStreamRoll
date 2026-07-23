"use client"

import { useMemo } from "react"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { StreamTagChips } from "@/components/streams/stream-tag-chips"
import { TagCombobox } from "@/components/streams/tag-combobox"
import {
  attachTagToStream,
  detachTagFromStream,
  type Tag,
  TagsApiError,
} from "@/lib/api/tags"
import {
  useAttachStreamTag,
  useDetachStreamTag,
  useStreamTags,
} from "@/hooks/useStreams"

export interface StreamTagEditorProps {
  streamId: number
  /** Tags currently attached on the server — seeds the cache on mount. */
  initialTags: Tag[]
  /** Identity of the actor making the change (placeholder for JWT). */
  actingUserId: string | number
}

/**
 * Composes TagCombobox + StreamTagChips and persists changes through
 * the tags API. Migrated to React Query in issue #345: the visible
 * chip set is now derived from the
 * `["streams","tags","<streamId>"]` query cache, and mutations
 * optimistically update it before awaiting the server response so
 * the UI never feels laggy.
 */
export function StreamTagEditor({
  streamId,
  initialTags,
  actingUserId,
}: StreamTagEditorProps) {
  const tagsQuery = useStreamTags(streamId, initialTags)
  const tags = tagsQuery.data ?? []

  const attachMutation = useAttachStreamTag({
    onError: (err) => toast.error(tagErrorMessage(err, "Failed to add tag")),
  })
  const detachMutation = useDetachStreamTag({
    onError: (err) => toast.error(tagErrorMessage(err, "Failed to remove tag")),
  })

  const busy = attachMutation.isPending || detachMutation.isPending

  // Stable memo of all known tag ids so the combobox can compute
  // duplicate-prevention without re-allocating a Set every render.
  const selectedIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags])

  function handleSelectionChange(next: Tag[]) {
    // The `useAttachStreamTag` / `useDetachStreamTag` hooks own their
    // own `onError` toast handlers — we don't need to re-catch here.
    // If a mutation rejects, React Query has already rolled the cache
    // back via `onError` and toasted; the remaining mutations in the
    // loop will still run because the await only fails the current
    // iteration. Subsequent iterations keep the optimistic flow going.
    const added = next.filter((n) => !selectedIds.has(n.id))
    const removed = tags.filter((t) => !next.some((n) => n.id === t.id))

    // Fire-and-forget `mutate` rather than `mutateAsync`. The
    // optimistic flow lives entirely inside React Query's queue —
    // onError rolls the cache back AND fires the consumer toast — so
    // the rejection never escapes the hooks and we don't need to
    // re-catch here. Using `mutateAsync` instead surfaced as an
    // unhandled rejection from each failed mutation in QA.
    for (const tag of added) {
      attachMutation.mutate({
        streamId,
        name: tag.name,
        userId: actingUserId,
      })
    }
    for (const tag of removed) {
      detachMutation.mutate({
        streamId,
        tagId: tag.id,
        userId: actingUserId,
      })
    }
  }

  function attach(name: string): Promise<Tag> {
    return new Promise((resolve, reject) => {
      attachMutation.mutate(
        {
          streamId,
          name,
          userId: actingUserId,
        },
        {
          onSuccess: (tag) => resolve(tag),
          onError: (err) => reject(err),
        },
      )
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Tags</CardTitle>
        <CardDescription>
          Add tags so viewers can find this stream. Type to create a new tag.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <TagCombobox
          value={tags}
          onChange={(next) => void handleSelectionChange(next)}
          onCreate={attach}
          disabled={busy}
        />
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Attached
          </p>
          <StreamTagChips
            tags={tags}
            onRemove={(tag) =>
              detachMutation.mutate({
                streamId,
                tagId: tag.id,
                userId: actingUserId,
              })
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

function tagErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof TagsApiError) return err.message
  if (err instanceof Error) return err.message
  return fallback
}

// Re-exported for callers that still want to bypass the React Query cache.
// The dashboard stream-new page uses this for "create a fresh stream"
// flows where there's no existing cache to optimise against.
export { attachTagToStream, detachTagFromStream }
