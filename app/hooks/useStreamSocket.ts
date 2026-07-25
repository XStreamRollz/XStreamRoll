'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  ConnectionStatus,
  StreamEvent,
} from '../components/StreamViewer/types';
import {
  createStreamSocket,
  subscribeToStream,
  unsubscribeFromStream,
} from '../lib/websocket';

const MAX_EVENTS = 100;

// Exponential backoff schedule for reconnection attempts after an
// unexpected disconnect. See #350.
const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

function toHttp(raw: string) {
  if (raw.startsWith('ws://')) return raw.replace(/^ws:\/\//, 'http://')
  if (raw.startsWith('wss://')) return raw.replace(/^wss:\/\//, 'https://')
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

export const useStreamSocket = (url: string) => {
  const socketRef = useRef<Socket | null>(null);
  // AC: safety net inside the hook itself (#350). The consumer should
  // also memoize their `url` prop with useMemo, but if they don't we
  // can still avoid redundant set-up when the URL string is value-equal
  // to the one we just processed.
  const lastSetupUrlRef = useRef<string | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [status, setStatus] =
    useState<ConnectionStatus>('connecting');

  const [events, setEvents] = useState<StreamEvent[]>([]);

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

    const socket = createStreamSocket(url);
    socketRef.current = socket;

    setStatus('connecting');

    const handleConnect = () => {
      // Reset backoff so the next unexpected disconnect starts at the
      // initial delay again.
      attemptRef.current = 0
      setStatus('connected')
    };
    const handleConnectError = () => setStatus('error');
    const handleDisconnect = (reason: string) => {
      setStatus('disconnected');
      // `io client disconnect` is raised by our own intentional
      // socket.disconnect() call; don't auto-reconnect in that case.
      // Same goes for `io server disconnect` when the server actively
      // kicked us — we don't want to keep hammering.
      if (
        reason === 'io client disconnect' ||
        reason === 'io server disconnect'
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
          socket.connect();
        }
      }, delay)
    };

    // Map server payloads to the local StreamEvent shape
    const mapPayload = (eventName: string, payload: any): StreamEvent => {
      const streamId = payload?.streamId ?? payload?.id ?? ''
      const ts =
        payload?.startedAt ?? payload?.stoppedAt ?? payload?.occurredAt ?? new Date().toISOString()
      const id = `${eventName}:${String(streamId)}:${Date.now()}`
      let type = eventName
      let message = JSON.stringify(payload)

      if (eventName === 'stream:started') {
        type = 'started'
        message = `Stream ${streamId} started by ${payload?.userId ?? 'unknown'}`
      } else if (eventName === 'stream:stopped') {
        type = 'stopped'
        message = `Stream ${streamId} stopped${payload?.reason ? `: ${payload.reason}` : ''}`
      } else if (eventName === 'stream:error') {
        type = 'error'
        message = `${payload?.code ?? 'ERROR'}: ${payload?.message ?? 'unknown'}`
      }

      return {
        id,
        type,
        message,
        timestamp: ts,
      }
    }

    const onStarted = (payload: any) => {
      const ev = mapPayload('stream:started', payload)
      setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS))
    }
    const onStopped = (payload: any) => {
      const ev = mapPayload('stream:stopped', payload)
      setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS))
    }
    const onError = (payload: any) => {
      const ev = mapPayload('stream:error', payload)
      setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS))
    }

    socket.on('connect', handleConnect)
    socket.on('connect_error', handleConnectError)
    socket.on('disconnect', handleDisconnect)

    socket.on('stream:started', onStarted)
    socket.on('stream:stopped', onStopped)
    socket.on('stream:error', onError)

    // Auto-subscribe to a stream room if the URL contains an id
    let subscribedStreamId: string | null = null
    try {
      const parsed = new URL(toHttp(url))
      // Check path like /streams/:id
      const match = parsed.pathname.match(/\/streams\/(?<id>[^\/]+)/)
      const idFromPath = match?.groups?.id
      const idFromQuery = parsed.searchParams.get('streamId') ?? parsed.searchParams.get('id')
      const streamId = idFromPath ?? idFromQuery
      if (streamId) {
        void subscribeToStream(socket, streamId).then(() => {
          subscribedStreamId = streamId
        })
      }
    } catch {
      // ignore malformed URL
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

      socket.off('connect', handleConnect)
      socket.off('connect_error', handleConnectError)
      socket.off('disconnect', handleDisconnect)

      socket.off('stream:started', onStarted)
      socket.off('stream:stopped', onStopped)
      socket.off('stream:error', onError)

      if (subscribedStreamId) {
        void unsubscribeFromStream(socket, subscribedStreamId).catch(() => undefined)
      }

      // Do not disconnect the shared socket here — it's shared across
      // consumers. We only remove listeners to avoid duplicates.
    }
  }, [url])

  // AC safety net (#350): memoize the returned object so a parent that
  // re-renders for unrelated reasons doesn't force every consumer to
  // re-render too. Combined with the URL equality guard above, this lets
  // us confidently report status without thrashing the WebSocket layer.
  return useMemo(() => ({ status, events }), [status, events])
}
