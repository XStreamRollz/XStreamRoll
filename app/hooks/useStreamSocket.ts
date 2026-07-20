'use client';

import { useEffect, useRef, useState } from 'react';
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

function toHttp(raw: string) {
  if (raw.startsWith('ws://')) return raw.replace(/^ws:\/\//, 'http://')
  if (raw.startsWith('wss://')) return raw.replace(/^wss:\/\//, 'https://')
  return raw
}

export const useStreamSocket = (url: string) => {
  const socketRef = useRef<Socket | null>(null);

  const [status, setStatus] =
    useState<ConnectionStatus>('connecting');

  const [events, setEvents] = useState<StreamEvent[]>([]);

  useEffect(() => {
    const socket = createStreamSocket(url);
    socketRef.current = socket;

    setStatus('connecting');

    const handleConnect = () => setStatus('connected');
    const handleConnectError = () => setStatus('error');
    const handleDisconnect = () => setStatus('disconnected');

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

  return {
    status,
    events,
  }
}