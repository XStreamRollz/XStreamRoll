/**
 * Mirrors the `webhook_subscriptions` table defined in `database/schema.sql`.
 */
export interface WebhookSubscription {
  id: number
  userId: number
  streamId: number
  url: string
  events: string[]
  secret: string
  active: boolean
  createdAt: Date
}
