"use client"

import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Tag } from "@/lib/api/tags"

export interface StreamTagChipsProps {
  tags: Tag[]
  /** Omit `onRemove` to render in read-only mode. */
  onRemove?: (tag: Tag) => void
  className?: string
  emptyLabel?: string
}

/**
 * Renders the tags attached to a stream as removable chips. Designed
 * for the stream detail page where the owner can prune attachments
 * without opening the full combobox.
 */
export function StreamTagChips({
  tags,
  onRemove,
  className,
  emptyLabel = "No tags attached.",
}: StreamTagChipsProps) {
  if (tags.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {emptyLabel}
      </p>
    )
  }

  return (
    <ul
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      aria-label="stream tags"
    >
      {tags.map((tag) => (
        <li key={tag.id}>
          <Badge variant="secondary" className="gap-1">
            <span>{tag.name}</span>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="-mr-1 rounded-sm opacity-60 hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`Remove tag ${tag.name}`}
              >
                <X className="size-3" />
              </button>
            )}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
