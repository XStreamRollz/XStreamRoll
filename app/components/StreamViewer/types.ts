export type ConnectionStatus =
  "connecting" | "connected" | "disconnected" | "error"

export interface StreamEvent {
  id: string
  type: string
  message: string
  timestamp: string
}
