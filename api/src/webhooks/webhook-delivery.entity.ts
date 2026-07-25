/**
 * Mirrors the `webhook_deliveries` table defined in `database/schema.sql`.
 */
export type WebhookDeliveryStatus = "pending" | "success" | "failed"

export interface WebhookDelivery {
  id: number
  webhookSubscriptionId: number
  event: string
  payload: Record<string, unknown>
  status: WebhookDeliveryStatus
  attemptCount: number
  lastStatusCode: number | null
  lastResponseBody: string | null
  lastError: string | null
  nextAttemptAt: Date | null
  deliveredAt: Date | null
  createdAt: Date
}
