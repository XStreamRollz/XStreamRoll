"use client"

import { useState } from "react"
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
  Tag,
  TagsApiError,
} from "@/lib/api/tags"

export interface StreamTagEditorProps {
  streamId: number
  /** Tags currently attached on the server. */
  initialTags: Tag[]
  /** Identity of the actor making the change (placeholder for JWT). */
  actingUserId: string | number
}

/**
 * Composes TagCombobox + StreamTagChips and persists changes through
 * the tags API. Used on the stream creation and edit forms, and on
 * the stream detail page as a self-contained widget.
 *
 * Local state strategy: optimistic — we update the visible chips
 * immediately, then roll back if the API rejects the change so the UI
 * never feels laggy.
 */
export function StreamTagEditor({
  streamId,
  initialTags,
  actingUserId,
}: StreamTagEditorProps) {
  const [tags, setTags] = useState<Tag[]>(initialTags)
  const [busy, setBusy] = useState(false)

  async function attach(name: string): Promise<Tag> {
    setBusy(true)
    try {
      const created = await attachTagToStream(streamId, name, {
        userId: actingUserId,
      })
      return created
    } finally {
      setBusy(false)
    }
  }

  async function handleSelectionChange(next: Tag[]) {
    const previous = tags
    setTags(next)

    const added = next.filter((n) => !previous.some((p) => p.id === n.id))
    const removed = previous.filter((p) => !next.some((n) => n.id === p.id))

    try {
      // Persist additions sequentially so the server can de-duplicate
      // tag creation; the per-call latency is small enough that this is
      // not a bottleneck for typical tag counts.
      for (const tag of added) {
        await attachTagToStream(streamId, tag.name, { userId: actingUserId })
      }
      for (const tag of removed) {
        await detachTagFromStream(streamId, tag.id, { userId: actingUserId })
      }
    } catch (err) {
      const message =
        err instanceof TagsApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "tag update failed"
      toast.error(`Failed to update tags: ${message}`)
      setTags(previous)
    }
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
              void handleSelectionChange(tags.filter((t) => t.id !== tag.id))
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}
