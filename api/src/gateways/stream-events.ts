/**
 * Canonical event names broadcast by the streams WebSocket gateway.
 * Exporting a frozen literal map keeps the wire-protocol single-sourced
 * for both server and client SDKs.
 */
export const STREAM_EVENTS = Object.freeze({
  STARTED: "stream:started",
  STOPPED: "stream:stopped",
  ERROR: "stream:error",
} as const)

export type StreamEventName = (typeof STREAM_EVENTS)[keyof typeof STREAM_EVENTS]

export interface StreamStartedPayload {
  streamId: string | number
  userId: string | number
  startedAt: string
}

export interface StreamStoppedPayload {
  streamId: string | number
  userId: string | number
  stoppedAt: string
  reason?: string
}

export interface StreamErrorPayload {
  streamId: string | number
  userId?: string | number
  occurredAt: string
  code: string
  message: string
}
