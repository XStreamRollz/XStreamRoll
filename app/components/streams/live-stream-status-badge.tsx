"use client"

import { useMemo } from "react"
import type { StreamStatus } from "@xstreamroll/types"
import { useStreamSocket } from "../../hooks/useStreamSocket"
import { StreamStatusBadge, type StreamStatusValue } from "./stream-status-badge"

const DEFAULT_API_BASE = "http://localhost:3001"

function apiBase(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  return DEFAULT_API_BASE
}

export interface LiveStreamStatusBadgeProps {
  streamId: string | number
  /** Status to show until a WebSocket lifecycle event updates it. */
  initialStatus: StreamStatus
  showIcon?: boolean
  className?: string
}

/**
 * `StreamStatusBadge` wired to the stream's WebSocket room (issue #362).
 *
 * Joins `stream:<streamId>` via `useStreamSocket` and swaps in the live
 * status the moment a `stream:started`/`stream:stopped`/`stream:error`
 * event arrives for this stream — no polling, no page or list re-fetch.
 * `initialStatus` (typically the server-rendered value) is shown until
 * then.
 */
export function LiveStreamStatusBadge({
  streamId,
  initialStatus,
  showIcon,
  className,
}: LiveStreamStatusBadgeProps) {
  const wsUrl = useMemo(
    () => `${apiBase()}/streams/${encodeURIComponent(String(streamId))}`,
    [streamId],
  )
  const { streamStatus } = useStreamSocket(wsUrl)

  const status: StreamStatusValue = streamStatus ?? initialStatus

  return (
    <StreamStatusBadge status={status} showIcon={showIcon} className={className} />
  )
}
