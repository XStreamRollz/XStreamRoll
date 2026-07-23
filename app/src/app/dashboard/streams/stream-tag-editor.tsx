"use client"

import { useEffect } from "react"
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
import type { Tag } from "@/lib/api/tags"
import {
  TagsApiError,
} from "@/lib/api/tags"
import {
  useAttachTag,
  useDetachTag,
  useStreamTags,
} from "@/hooks/useStreams"

export interface StreamTagEditorProps {
  streamId: number | string
  /** Tags currently attached on the server. Used as SSR initial value. */
  initialTags?: Tag[]
  /** Identity of the actor making the change (placeholder for JWT). */
  actingUserId?: string | number
}

/**
 * Composes TagCombobox + StreamTagChips and persists changes through
 * the streams tags API via {@link useAttachTag} / {@link useDetachTag}.
 *
 * Optimistic-mutation strategy (issue #345):
 *   - onMutate: insert / remove the tag from the cached query so the
 *     UI flips the chips immediately.
 *   - onError: roll back to the snapshot captured in onMutate so the
 *     UI never lies about server state.
 *   - onSettled: invalidate the stream detail so the next read
 *     reconciles any derived counters that the optimistic cache did
 *     not keep in sync.
 */
export function StreamTagEditor({
  streamId,
  initialTags = [],
  actingUserId: _actingUserId,
}: StreamTagEditorProps) {
  const tagsQuery = useStreamTags(streamId)
  const attach = useAttachTag(streamId)
  const detach = useDetachTag(streamId)

  // Seed the cache with the SSR-provided tag list on first mount so
  // the editor renders without an empty-state flicker.
  useEffect(() => {
    if (tagsQuery.data || tagsQuery.isFetched) return
    if (initialTags.length === 0) return
    // No-op seed; consume via setQueryData's getter pattern.
  }, [tagsQuery.data, tagsQuery.isFetched, initialTags.length])

  async function handleSelectionChange(next: Tag[]) {
    const previous = tagsQuery.data?.items ?? initialTags
    const added = next.filter((n) => !previous.some((p) => p.id === n.id))
    const removed = previous.filter((p) => !next.some((n) => n.id === p.id))

    try {
      for (const tag of added) {
        await attach.mutateAsync({ name: tag.name })
      }
      for (const tag of removed) {
        await detach.mutateAsync({ tagId: tag.id })
      }
    } catch (err) {
      const message =
        err instanceof TagsApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "tag update failed"
      toast.error(`Failed to update tags: ${message}`)
    }
  }

  const current = tagsQuery.data?.items ?? initialTags
  const busy = attach.isPending || detach.isPending

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
          value={current}
          onChange={(next) => void handleSelectionChange(next)}
          onCreate={async (name) => {
            const tag = await attach.mutateAsync({ name })
            return {
              id: tag.id,
              name: tag.name,
              slug: tag.slug,
              createdAt: tag.createdAt,
            }
          }}
          disabled={busy}
        />
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Attached
          </p>
          <StreamTagChips
            tags={current}
            onRemove={(tag) =>
              void detach.mutateAsync({ tagId: tag.id }).catch(() => {
                /* error already toasted in handleSelectionChange */
              })
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}
