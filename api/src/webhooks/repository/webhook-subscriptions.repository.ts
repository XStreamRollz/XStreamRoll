import { Injectable } from "@nestjs/common"
import { WebhookSubscription } from "../webhook-subscription.entity"

/**
 * In-memory webhook subscriptions repository.
 *
 * Kept for unit testing and local development without a database. The
 * service layer depends on this class as an injection token rather than a
 * concrete implementation, so tests can swap in the DB-backed repository
 * via the NestJS DI container.
 */
@Injectable()
export class WebhookSubscriptionsRepository {
  private readonly byId = new Map<number, WebhookSubscription>()
  private nextId = 1

  async create(data: {
    userId: number
    streamId: number
    url: string
    events: string[]
    secret: string
  }): Promise<WebhookSubscription> {
    const subscription: WebhookSubscription = {
      id: this.nextId++,
      userId: data.userId,
      streamId: data.streamId,
      url: data.url,
      events: data.events,
      secret: data.secret,
      active: true,
      createdAt: new Date(),
    }
    this.byId.set(subscription.id, subscription)
    return subscription
  }

  async findById(id: number): Promise<WebhookSubscription | undefined> {
    return this.byId.get(id)
  }

  /**
   * Returns every active subscription on `streamId` whose `events` list
   * contains `event`.
   */
  async findActiveByStreamAndEvent(
    streamId: number,
    event: string,
  ): Promise<WebhookSubscription[]> {
    return Array.from(this.byId.values()).filter(
      (s) => s.streamId === streamId && s.active && s.events.includes(event),
    )
  }
}
