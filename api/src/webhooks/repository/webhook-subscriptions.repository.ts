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

  /**
   * Paginated list of a user's subscriptions, newest first. Pass
   * `streamId` to narrow to a single stream. The caller's ownership is
   * enforced by the `user_id` filter itself — a user can only ever
   * list their own subscriptions.
   */
  async listByUser(
    userId: number,
    page: number,
    limit: number,
    streamId?: number,
  ): Promise<{ items: WebhookSubscription[]; total: number }> {
    const matching = Array.from(this.byId.values())
      .filter((s) => s.userId === userId)
      .filter((s) => streamId === undefined || s.streamId === streamId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    const offset = (page - 1) * limit
    return {
      items: matching.slice(offset, offset + limit),
      total: matching.length,
    }
  }

  /**
   * Applies a partial update. Only the fields present in `changes` are
   * touched — notably there is no `secret` key, so a caller can never
   * rotate the signing secret through this path.
   */
  async update(
    id: number,
    changes: { url?: string; events?: string[]; active?: boolean },
  ): Promise<WebhookSubscription | undefined> {
    const subscription = this.byId.get(id)
    if (!subscription) return undefined

    if (changes.url !== undefined) subscription.url = changes.url
    if (changes.events !== undefined) subscription.events = changes.events
    if (changes.active !== undefined) subscription.active = changes.active
    return subscription
  }

  /** Returns true when a subscription was deleted, false when it didn't exist. */
  async delete(id: number): Promise<boolean> {
    return this.byId.delete(id)
  }
}
