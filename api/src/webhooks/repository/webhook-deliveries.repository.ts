import { Injectable } from "@nestjs/common"
import { WebhookDelivery } from "../webhook-delivery.entity"

export interface RecordAttemptInput {
  statusCode: number | null
  responseBody: string | null
  error: string | null
  success: boolean
  /** Null when the delivery is terminal (delivered, or retries exhausted). */
  nextAttemptAt: Date | null
}

/**
 * In-memory webhook deliveries repository.
 *
 * Kept for unit testing and local development without a database. The
 * service layer depends on this class as an injection token rather than a
 * concrete implementation, so tests can swap in the DB-backed repository
 * via the NestJS DI container.
 */
@Injectable()
export class WebhookDeliveriesRepository {
  private readonly byId = new Map<number, WebhookDelivery>()
  private nextId = 1

  async create(
    webhookSubscriptionId: number,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<WebhookDelivery> {
    const delivery: WebhookDelivery = {
      id: this.nextId++,
      webhookSubscriptionId,
      event,
      payload,
      status: "pending",
      attemptCount: 0,
      lastStatusCode: null,
      lastResponseBody: null,
      lastError: null,
      nextAttemptAt: new Date(),
      deliveredAt: null,
      createdAt: new Date(),
    }
    this.byId.set(delivery.id, delivery)
    return delivery
  }

  async findById(id: number): Promise<WebhookDelivery | undefined> {
    return this.byId.get(id)
  }

  async listBySubscriptionPaginated(
    webhookSubscriptionId: number,
    page: number,
    limit: number,
  ): Promise<{ items: WebhookDelivery[]; total: number }> {
    const matching = Array.from(this.byId.values())
      .filter((d) => d.webhookSubscriptionId === webhookSubscriptionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    const offset = (page - 1) * limit
    return {
      items: matching.slice(offset, offset + limit),
      total: matching.length,
    }
  }

  /** Pending deliveries whose next attempt is due, oldest first. */
  async findDuePending(limit: number): Promise<WebhookDelivery[]> {
    const now = Date.now()
    return Array.from(this.byId.values())
      .filter(
        (d) =>
          d.status === "pending" &&
          d.nextAttemptAt !== null &&
          d.nextAttemptAt.getTime() <= now,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit)
  }

  async recordAttempt(
    id: number,
    result: RecordAttemptInput,
  ): Promise<WebhookDelivery | undefined> {
    const delivery = this.byId.get(id)
    if (!delivery) return undefined

    delivery.attemptCount += 1
    delivery.lastStatusCode = result.statusCode
    delivery.lastResponseBody = result.responseBody
    delivery.lastError = result.error
    delivery.nextAttemptAt = result.nextAttemptAt
    if (result.success) {
      delivery.status = "success"
      delivery.deliveredAt = new Date()
    } else {
      delivery.status = result.nextAttemptAt ? "pending" : "failed"
    }
    return delivery
  }
}
