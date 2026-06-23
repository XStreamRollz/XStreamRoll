export type StreamStatus = "active" | "inactive" | "error"
export type StreamVisibility = "public" | "private"

export interface Stream {
  id: string
  userId: string
  name: string
  description: string | null
  status: StreamStatus
  visibility: StreamVisibility
  createdAt: string
  updatedAt: string
}

export interface CreateStreamDto {
  name: string
  description?: string
  visibility?: StreamVisibility
}

export interface UpdateStreamDto {
  name?: string
  description?: string
  status?: StreamStatus
  visibility?: StreamVisibility
}

export type StreamEventType =
  | "stream:started"
  | "stream:stopped"
  | "stream:error"
  | "viewer:joined"
  | "viewer:left"
  | "data"

export interface StreamEvent {
  streamId: string
  eventType: StreamEventType
  data: Record<string, unknown>
  timestamp?: string
}

export interface StreamEventRecord {
  id: string
  streamId: string
  eventType: StreamEventType
  payload: Record<string, unknown>
  occurredAt: string
}
