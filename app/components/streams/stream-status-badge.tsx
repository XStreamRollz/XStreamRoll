"use client"

import { AlertCircle, Circle, Radio } from "lucide-react"
import * as React from "react"

import { Badge, type BadgeProps } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type StreamStatusValue =
  "active" | "inactive" | "error" | "starting" | "stopping"

export interface StreamStatusBadgeProps extends Omit<BadgeProps, "variant"> {
  status: StreamStatusValue
  /** Show a leading dot icon. Defaults to true. */
  showIcon?: boolean
}

/**
 * Map a status string to a visual variant + accessible label. Kept
 * exhaustive (and a `never` check at the end) so adding a new
 * {@link StreamStatusValue} causes a type error in development.
 */
const STATUS_PRESENTATION: Record<
  StreamStatusValue,
  {
    label: string
    variant: BadgeProps["variant"]
    dotClass: string
    icon: React.ElementType
  }
> = {
  active: {
    label: "Live",
    variant: "default",
    dotClass: "bg-emerald-500",
    icon: Radio,
  },
  starting: {
    label: "Starting",
    variant: "secondary",
    dotClass: "bg-amber-500",
    icon: Circle,
  },
  stopping: {
    label: "Stopping",
    variant: "secondary",
    dotClass: "bg-amber-500",
    icon: Circle,
  },
  inactive: {
    label: "Offline",
    variant: "outline",
    dotClass: "bg-muted-foreground/40",
    icon: Circle,
  },
  error: {
    label: "Error",
    variant: "destructive",
    dotClass: "bg-destructive",
    icon: AlertCircle,
  },
}

/**
 * Compact visual indicator of a stream's lifecycle state.
 *
 * Designed to be dropped into list rows, cards, and detail headers
 * without forcing the parent to care about the icon, colour, or
 * copy that should accompany each state. Pass a raw
 * {@link StreamStatusValue} (e.g. straight from the API) and the
 * component picks the right look.
 *
 * The component is purely presentational; no network calls, no
 * timers — easy to render in server components.
 */
export function StreamStatusBadge({
  status,
  showIcon = true,
  className,
  children,
  ...badgeProps
}: StreamStatusBadgeProps) {
  const presentation =
    STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.inactive
  const Icon = presentation.icon

  return (
    <Badge
      variant={presentation.variant}
      aria-label={`Stream status: ${presentation.label}`}
      className={cn("gap-1.5", className)}
      {...badgeProps}
    >
      {showIcon && (
        <Icon
          className={cn(
            "size-3 shrink-0",
            // The "dot" presentations share styling with the icon
            // class so a coloured Circle gives the live-pulse look.
            status === "active" ||
              status === "starting" ||
              status === "stopping"
              ? presentation.dotClass
              : undefined,
          )}
          aria-hidden="true"
        />
      )}
      {children ?? presentation.label}
    </Badge>
  )
}
