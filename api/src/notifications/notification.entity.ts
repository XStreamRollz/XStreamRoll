/**
 * Mirrors the `notifications` table defined in `database/schema.sql`.
 */
export interface Notification {
  id: number
  userId: number
  type: string
  payload: Record<string, unknown>
  readAt: Date | null
  createdAt: Date
  expiresAt: Date
}
