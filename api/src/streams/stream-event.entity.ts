export interface StreamEventRecord {
  id: number
  streamId: number
  eventType: string
  payload: Record<string, unknown>
  occurredAt: Date
}
