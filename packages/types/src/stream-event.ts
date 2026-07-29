/** Types of events that can occur on a stream. */
export type StreamEventType =
  | "stream:started"
  | "stream:stopped"
  | "stream:error"
  | "viewer:joined"
  | "viewer:left"
  | "data"

/** A real-time event published for a stream. */
export interface StreamEvent {
  streamId: string
  eventType: StreamEventType
  data: Record<string, unknown>
  timestamp?: string
}

/** A persisted stream event record, as returned by the API. */
export interface StreamEventRecord {
  id: string
  streamId: string
  eventType: StreamEventType
  payload: Record<string, unknown>
  occurredAt: string
}
