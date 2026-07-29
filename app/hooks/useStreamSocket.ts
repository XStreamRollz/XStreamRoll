"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Socket } from "socket.io-client"
import type { StreamStatus as StreamStatusValue } from "@xstreamroll/types"
import { ConnectionStatus, StreamEvent } from "../components/StreamViewer/types"
import {
  createStreamSocket,
  type CreateStreamSocketOptions,
  subscribeToStream,
  unsubscribeFromStream,
} from "../lib/websocket"

<<<<<<< HEAD
/**
 * Wire-shape payload delivered by the stream-event socket gateway
 * (`api/src/gateways/stream-events.ts`). The server may emit either
 * `streamId` or `id` on every event (the latter is the legacy alias
 * kept for backward-compat with older clients), so both are typed
 * optional. Field-level optionality matches what each event actually
 * carries:
 *   stream:started -> streamId, userId, startedAt
 *   stream:stopped -> streamId, reason, stoppedAt
 *   stream:error   -> streamId, code, message, occurredAt
 *
 * Replaces 5 `(payload: StreamEventPayload)` callbacks that previously tripped
 * `@typescript-eslint/no-explicit-any` and forced `git commit` to be
 * run with `--no-verify`. With this interface the husky pre-commit
 * hook (`eslint --max-warnings=0` on staged files) passes cleanly.
 */
interface StreamEventPayload {
  streamId?: string | number
  id?: string | number
  userId?: string | number
  startedAt?: string
  stoppedAt?: string
  occurredAt?: string
  reason?: string
  code?: string
  message?: string
}

// Hard upper bound on the number of stream events the hook retains in
// memory at any time. Combined with the windowed renderer in
// `StreamFeed`, a queue of this size keeps the DOM lean even when the
// underlying stream is sustained. The limit is enforced via
// `slice(-MAX_EVENTS)` on every append, so the most recent MAX_EVENTS
// entries always remain available while older ones drop off.
const MAX_EVENTS = 1000
=======
const MAX_EVENTS = 100
>>>>>>> origin/main

// Exponential backoff schedule for reconnection attempts after an
// unexpected disconnect. See #350.
const BACKOFF_INITIAL_MS = 1_000
const BACKOFF_MAX_MS = 30_000

function toHttp(raw: string) {
  if (raw.startsWith("ws://")) return raw.replace(/^ws:\/\//, "http://")
  if (raw.startsWith("wss://")) return raw.replace(/^wss:\/\//, "https://")
  return raw
}

/**
 * Pure exponential backoff schedule. Exposed for testing so the
 * sequence can be validated without relying on fake timers.
 *
 *  attempt | delay (ms, default)
 *  --------|---------------------
 *    1     | 1000
 *    2     | 2000
 *    3     | 4000
 *    4     | 8000
 *    5     | 16000
 *    6+    | 30000 (capped)
 *
 * `attempt` is 1-indexed; non-positive values return 0.
 */
export function computeBackoff(
  attempt: number,
  options: { initialMs?: number; maxMs?: number } = {},
): number {
  if (!Number.isFinite(attempt) || attempt <= 0) return 0
  const initial = options.initialMs ?? BACKOFF_INITIAL_MS
  const max = options.maxMs ?? BACKOFF_MAX_MS
  // 1 -> initial, 2 -> initial * 2, 3 -> initial * 4, ...
  const exp = initial * Math.pow(2, attempt - 1)
  return Math.min(Math.round(exp), max)
}

<<<<<<< HEAD
export const useStreamSocket = (url: string) => {
=======
export const useStreamSocket = (
  url: string,
  options: CreateStreamSocketOptions = {},
) => {
>>>>>>> origin/main
  const socketRef = useRef<Socket | null>(null)
  // AC: safety net inside the hook itself (#350). The consumer should
  // also memoize their `url` prop with useMemo, but if they don't we
  // can still avoid redundant set-up when the URL string is value-equal
  // to the one we just processed.
  const lastSetupUrlRef = useRef<string | null>(null)
  const attemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [status, setStatus] = useState<ConnectionStatus>("connecting")

  const [events, setEvents] = useState<StreamEvent[]>([])

  // Live lifecycle status of the stream this hook auto-subscribed to
  // (parsed from `url` — see below). `null` until the first
  // stream:started/stopped/error event for that stream arrives; the
  // caller is expected to seed its own initial value (e.g. from the
  // server-rendered stream record) and only defer to this once it's
  // non-null (#362).
  const [streamStatus, setStreamStatus] = useState<StreamStatusValue | null>(
    null,
  )
<<<<<<< HEAD
=======

  // Issue #319 — `options` is destructured into a primitive so it can be
  // used safely as a useEffect dep without re-running setup every render
  // (the optional `options` object would be referentially new each
  // call). Consumers that want to swap tokens mid-lifecycle should
  // memoise the surrounding options object or accept that changing the
  // token tears the connection down and rebuilds it (intentional).
  const token = options?.token
>>>>>>> origin/main

  useEffect(() => {
    // Safe-equality guard: skip when the URL is value-equal to the last
    // one we set up against. Strings are primitives so this is reliable;
    // the consumer-side useMemo recommended in #350 handles the case of
    // a non-memoized expression that yields an equal string each render.
    if (lastSetupUrlRef.current === url && socketRef.current) {
      return
    }
    lastSetupUrlRef.current = url

    // Cancel any pending reconnect from a previous URL/disconnect cycle.
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    attemptRef.current = 0

<<<<<<< HEAD
    const socket = createStreamSocket(url)
=======
    const socket = createStreamSocket(url, { token })
>>>>>>> origin/main
    socketRef.current = socket

    setStatus("connecting")
    setStreamStatus(null)

    // Resolve which stream room this hook instance cares about, from
    // either the URL path (/streams/:id) or a `streamId`/`id` query
    // param. The underlying socket connection is shared/cached across
    // hook instances (see lib/websocket.ts), so multiple stream rows on
    // a list page each mount their own `useStreamSocket` call and all
    // share one connection — this filter is what keeps one row's status
    // events from leaking into another's (#362).
    let targetStreamId: string | null = null
    try {
      const parsed = new URL(toHttp(url))
      const match = parsed.pathname.match(/\/streams\/(?<id>[^\/]+)/)
      const idFromPath = match?.groups?.id
      const idFromQuery =
        parsed.searchParams.get("streamId") ?? parsed.searchParams.get("id")
      targetStreamId = idFromPath ?? idFromQuery ?? null
    } catch {
      // ignore malformed URL
    }

    const handleConnect = () => {
      // Reset backoff so the next unexpected disconnect starts at the
      // initial delay again.
      attemptRef.current = 0
      setStatus("connected")
    }
    const handleConnectError = () => setStatus("error")
    const handleDisconnect = (reason: string) => {
      setStatus("disconnected")
      // `io client disconnect` is raised by our own intentional
      // socket.disconnect() call; don't auto-reconnect in that case.
      // Same goes for `io server disconnect` when the server actively
      // kicked us — we don't want to keep hammering.
      if (
        reason === "io client disconnect" ||
        reason === "io server disconnect"
      ) {
        return
      }
      if (reconnectTimerRef.current) return // already scheduled
      attemptRef.current += 1
      const delay = computeBackoff(attemptRef.current)
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        // If socket.io's built-in reconnect already re-established the
        // connection by the time the timer fires, this is a harmless
        // no-op. Otherwise it kicks off a fresh attempt. Honors the
        // exponential schedule declared in #350.
        if (!socket.connected) {
          socket.connect()
        }
      }, delay)
    }

    // Map server payloads to the local StreamEvent shape
    const mapPayload = (
      eventName: string,
<<<<<<< HEAD
      payload: StreamEventPayload,
=======
      payload: Record<string, unknown>,
>>>>>>> origin/main
    ): StreamEvent => {
      const streamId = payload?.streamId ?? payload?.id ?? ""
      const ts =
        payload?.startedAt ??
        payload?.stoppedAt ??
        payload?.occurredAt ??
        new Date().toISOString()
      const id = `${eventName}:${String(streamId)}:${Date.now()}`
      let type = eventName
      let message = JSON.stringify(payload)

      if (eventName === "stream:started") {
        type = "started"
        message = `Stream ${streamId} started by ${payload?.userId ?? "unknown"}`
      } else if (eventName === "stream:stopped") {
        type = "stopped"
        message = `Stream ${streamId} stopped${payload?.reason ? `: ${payload.reason}` : ""}`
      } else if (eventName === "stream:error") {
        type = "error"
        message = `${payload?.code ?? "ERROR"}: ${payload?.message ?? "unknown"}`
      }

      return {
        id,
        type,
        message,
        timestamp: ts,
      }
    }

    // Only update `streamStatus` for events about the stream this hook
    // instance is scoped to. `events` (the raw log) still records
    // everything the socket delivers, unfiltered, as before.
<<<<<<< HEAD
    const matchesTarget = (payload: StreamEventPayload) =>
      targetStreamId === null ||
      String(payload?.streamId ?? payload?.id ?? "") === targetStreamId

    // Events are appended in chronological order (oldest -> newest) so
    // that `StreamFeed` can render them top-to-bottom in a virtualized
    // list. With prepending, the most recent event would sit at index 0
    // and `scrollToIndex(LAST)` would jump the user back to the top of
    // the feed instead of the bottom; with appending, the newest event
    // is always at `events.length - 1`, which is the natural target for
    // a “scroll to bottom” gesture (#358).
    //
    // Behavioural note: this is a breaking change to any consumer that
    // treated `events[0]` as “the most recent”. Today no consumer in
    // this repo does that — the display layer renders top-to-bottom —
    // so a future maintainer re-introducing prepend semantics should
    // also update the virtualizer’s auto-scroll target.
    const appendEvent = (ev: StreamEvent) =>
      setEvents((prev) => [...prev, ev].slice(-MAX_EVENTS))

    const onStarted = (payload: StreamEventPayload) => {
      appendEvent(mapPayload("stream:started", payload))
      if (matchesTarget(payload)) setStreamStatus("active")
    }
    const onStopped = (payload: StreamEventPayload) => {
      appendEvent(mapPayload("stream:stopped", payload))
      if (matchesTarget(payload)) setStreamStatus("inactive")
    }
    const onError = (payload: StreamEventPayload) => {
      appendEvent(mapPayload("stream:error", payload))
=======
    const matchesTarget = (payload: Record<string, unknown>) =>
      targetStreamId === null ||
      String(payload?.streamId ?? payload?.id ?? "") === targetStreamId

    const onStarted = (payload: Record<string, unknown>) => {
      const ev = mapPayload("stream:started", payload)
      setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS))
      if (matchesTarget(payload)) setStreamStatus("active")
    }
    const onStopped = (payload: Record<string, unknown>) => {
      const ev = mapPayload("stream:stopped", payload)
      setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS))
      if (matchesTarget(payload)) setStreamStatus("inactive")
    }
    const onError = (payload: Record<string, unknown>) => {
      const ev = mapPayload("stream:error", payload)
      setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS))
>>>>>>> origin/main
      if (matchesTarget(payload)) setStreamStatus("error")
    }

    socket.on("connect", handleConnect)
    socket.on("connect_error", handleConnectError)
    socket.on("disconnect", handleDisconnect)

    socket.on("stream:started", onStarted)
    socket.on("stream:stopped", onStopped)
    socket.on("stream:error", onError)

    // Auto-subscribe to the stream room resolved above, if any.
    let subscribedStreamId: string | null = null
    if (targetStreamId) {
      void subscribeToStream(socket, targetStreamId).then(() => {
        subscribedStreamId = targetStreamId
      })
    }

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      // Reset the safety-net marker so a re-mount (e.g. React 19
      // StrictMode's deliberate double-mount in dev) re-runs setup
      // instead of skipping over a clean ref. Without this, the
      // guard would otherwise suppress the second effect run and the
      // component would never attach listeners (#350).
      lastSetupUrlRef.current = null
      socketRef.current = null

      socket.off("connect", handleConnect)
      socket.off("connect_error", handleConnectError)
      socket.off("disconnect", handleDisconnect)

      socket.off("stream:started", onStarted)
      socket.off("stream:stopped", onStopped)
      socket.off("stream:error", onError)

      if (subscribedStreamId) {
        void unsubscribeFromStream(socket, subscribedStreamId).catch(
          () => undefined,
        )
      }

      // Do not disconnect the shared socket here — it's shared across
      // consumers. We only remove listeners to avoid duplicates.
    }
  }, [url, token])

  // AC safety net (#350): memoize the returned object so a parent that
  // re-renders for unrelated reasons doesn't force every consumer to
  // re-render too. Combined with the URL equality guard above, this lets
  // us confidently report status without thrashing the WebSocket layer.
  return useMemo(
    () => ({ status, events, streamStatus }),
    [status, events, streamStatus],
  )
}
