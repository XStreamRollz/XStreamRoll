import * as crypto from "crypto"

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { Interval } from "@nestjs/schedule"

import { WebhookDeliveriesRepository } from "./repository/webhook-deliveries.repository"
import { WebhookSubscriptionsRepository } from "./repository/webhook-subscriptions.repository"
import { WebhookDelivery } from "./webhook-delivery.entity"
import { WebhookSubscription } from "./webhook-subscription.entity"
import { PaginatedResult } from "../common/dto/pagination.dto"

const WEBHOOK_SECRET_BYTES = 32
const WEBHOOK_DELIVERY_TIMEOUT_MS = 10_000
/** Truncate stored response bodies so a misbehaving receiver can't bloat the deliveries table. */
const MAX_STORED_RESPONSE_BODY_LENGTH = 4_000

/**
 * Maximum number of retries after the initial delivery attempt (6 attempts
 * total). Delays are chosen so the final retry lands at ~24h after the
 * first failure, matching the "up to 5 retries over 24 hours" requirement:
 *   retry 1: +1 minute    (cumulative  1 min)
 *   retry 2: +5 minutes   (cumulative  6 min)
 *   retry 3: +30 minutes  (cumulative 36 min)
 *   retry 4: +3 hours     (cumulative  3h36m)
 *   retry 5: +20h24m      (cumulative 24h)
 */
export const MAX_RETRIES = 5
const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  3 * 60 * 60_000,
  20 * 60 * 60_000 + 24 * 60_000,
]

/** How often the retry sweep checks for due deliveries. */
const RETRY_SWEEP_INTERVAL_MS = 60_000
/** Cap on how many due deliveries a single sweep pass processes. */
const RETRY_SWEEP_BATCH_SIZE = 50

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name)

  constructor(
    private readonly subscriptions: WebhookSubscriptionsRepository,
    private readonly deliveries: WebhookDeliveriesRepository,
  ) {}

  async register(data: {
    userId: number
    streamId: number
    url: string
    events: string[]
  }): Promise<WebhookSubscription> {
    const secret = crypto.randomBytes(WEBHOOK_SECRET_BYTES).toString("hex")
    return this.subscriptions.create({ ...data, secret })
  }

  async findById(id: number): Promise<WebhookSubscription> {
    const subscription = await this.subscriptions.findById(id)
    if (!subscription) {
      throw new NotFoundException(`webhook ${id} not found`)
    }
    return subscription
  }

  async listDeliveries(
    webhookId: number,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<WebhookDelivery>> {
    // Confirms the subscription exists (and surfaces 404) before listing.
    await this.findById(webhookId)
    const { items, total } = await this.deliveries.listBySubscriptionPaginated(
      webhookId,
      page,
      limit,
    )
    return { data: items, page, limit, total }
  }

  /**
   * Paginated list of a caller's own subscriptions, newest first. The
   * `userId` filter makes the listing inherently owner-scoped — there is
   * no way to enumerate another user's webhooks.
   */
  async listByUser(
    userId: number,
    page: number,
    limit: number,
    streamId?: number,
  ): Promise<PaginatedResult<WebhookSubscription>> {
    const { items, total } = await this.subscriptions.listByUser(
      userId,
      page,
      limit,
      streamId,
    )
    return { data: items, page, limit, total }
  }

  /**
   * Partially updates a subscription (URL, events, and/or `active`).
   * The signing secret is deliberately not updatable — it is
   * creation-time-only (see `WebhooksController`). Returns the updated
   * subscription or throws 404 when the webhook does not exist.
   */
  async update(
    id: number,
    changes: { url?: string; events?: string[]; active?: boolean },
  ): Promise<WebhookSubscription> {
    await this.findById(id)
    const updated = await this.subscriptions.update(id, changes)
    if (!updated) {
      // The findById above succeeded, so this can only be a race with a
      // concurrent delete; surface the same 404 the caller expects.
      throw new NotFoundException(`webhook ${id} not found`)
    }
    return updated
  }

  /**
   * Deletes a subscription and (via the schema's ON DELETE CASCADE) all
   * of its deliveries. Throws 404 when the webhook does not exist.
   */
  async delete(id: number): Promise<void> {
    const deleted = await this.subscriptions.delete(id)
    if (!deleted) {
      throw new NotFoundException(`webhook ${id} not found`)
    }
  }

  /**
   * Manually re-queues a failed or pending delivery so the retry sweep
   * picks it up on its next pass. `attemptCount` is kept, so the manual
   * retry still operates inside the `MAX_RETRIES` budget — once the
   * budget is exhausted the delivery goes terminally failed again after
   * this one extra attempt.
   *
   * @throws NotFoundException  when the webhook or delivery does not exist,
   *                            or the delivery belongs to another webhook.
   * @throws ConflictException  when the delivery already succeeded.
   */
  async retryDelivery(
    webhookId: number,
    deliveryId: number,
  ): Promise<WebhookDelivery> {
    await this.findById(webhookId)

    const delivery = await this.deliveries.findById(deliveryId)
    if (!delivery || delivery.webhookSubscriptionId !== webhookId) {
      throw new NotFoundException(
        `delivery ${deliveryId} not found for webhook ${webhookId}`,
      )
    }
    if (delivery.status === "success") {
      throw new ConflictException(
        `delivery ${deliveryId} was already delivered`,
      )
    }

    const requeued = await this.deliveries.requeue(deliveryId)
    if (!requeued) {
      throw new NotFoundException(
        `delivery ${deliveryId} not found for webhook ${webhookId}`,
      )
    }
    return requeued
  }

  /**
   * Entry point called by application services (e.g. `StreamsService`) when
   * a stream lifecycle event occurs. Fans out to every active subscription
   * on `streamId` that lists `event`, logging a delivery row per
   * subscription and attempting first delivery in the background — this
   * must not block the caller on network I/O.
   */
  async dispatchStreamEvent(
    streamId: number,
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const matching = await this.subscriptions.findActiveByStreamAndEvent(
      streamId,
      event,
    )

    for (const subscription of matching) {
      const delivery = await this.deliveries.create(subscription.id, event, data)
      // Fire-and-forget: the stream lifecycle transition that triggered
      // this must not wait on an arbitrary third-party endpoint.
      this.attemptDelivery(subscription, delivery).catch((err) => {
        this.logger.error(
          `unexpected error attempting delivery ${delivery.id}`,
          (err as Error).stack,
        )
      })
    }
  }

  /**
   * Periodic retry sweep. Picks up pending deliveries whose `nextAttemptAt`
   * has elapsed and re-attempts them. Runs in-process on a fixed interval
   * rather than a separate worker/queue, matching this codebase's existing
   * (queue-free) architecture.
   */
  @Interval(RETRY_SWEEP_INTERVAL_MS)
  async sweepRetries(): Promise<void> {
    const due = await this.deliveries.findDuePending(RETRY_SWEEP_BATCH_SIZE)
    for (const delivery of due) {
      const subscription = await this.subscriptions.findById(
        delivery.webhookSubscriptionId,
      )
      if (!subscription || !subscription.active) {
        // Subscription was deleted/deactivated since this delivery was
        // queued — nothing sensible to retry against.
        continue
      }
      await this.attemptDelivery(subscription, delivery)
    }
  }

  /**
   * Signs and POSTs the delivery payload, then records the outcome. Never
   * throws — delivery failures are terminal only from the retry schedule's
   * point of view, not from the caller's.
   */
  private async attemptDelivery(
    subscription: WebhookSubscription,
    delivery: WebhookDelivery,
  ): Promise<void> {
    const body = JSON.stringify({
      event: delivery.event,
      streamId: subscription.streamId,
      data: delivery.payload,
      deliveryId: delivery.id,
      timestamp: new Date().toISOString(),
    })
    const signature = signPayload(subscription.secret, body)

    try {
      const response = await fetch(subscription.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
        },
        body,
        signal: AbortSignal.timeout(WEBHOOK_DELIVERY_TIMEOUT_MS),
      })

      const responseBody = (await response.text()).slice(
        0,
        MAX_STORED_RESPONSE_BODY_LENGTH,
      )
      const success = response.status >= 200 && response.status < 300

      await this.deliveries.recordAttempt(delivery.id, {
        statusCode: response.status,
        responseBody,
        error: null,
        success,
        nextAttemptAt: success
          ? null
          : nextAttemptAfter(delivery.attemptCount + 1),
      })
    } catch (err) {
      await this.deliveries.recordAttempt(delivery.id, {
        statusCode: null,
        responseBody: null,
        error: err instanceof Error ? err.message : String(err),
        success: false,
        nextAttemptAt: nextAttemptAfter(delivery.attemptCount + 1),
      })
    }
  }
}

/**
 * Returns the timestamp for the next retry, or `null` once
 * `MAX_RETRIES` has been exhausted (the delivery becomes terminally
 * "failed").
 *
 * @param attemptCountAfterThisAttempt total attempts made so far,
 *   including the one that just failed (1-indexed).
 */
export function nextAttemptAfter(attemptCountAfterThisAttempt: number): Date | null {
  const retryIndex = attemptCountAfterThisAttempt - 1
  if (retryIndex >= MAX_RETRIES) {
    return null
  }
  return new Date(Date.now() + RETRY_DELAYS_MS[retryIndex])
}

/** HMAC-SHA256 signature in the `sha256=<hex>` format, over the exact raw body bytes. */
export function signPayload(secret: string, rawBody: string): string {
  const hmac = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  return `sha256=${hmac}`
}
