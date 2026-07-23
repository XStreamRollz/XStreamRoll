import { Injectable, Logger, NotFoundException, Optional } from "@nestjs/common"
import { Interval } from "@nestjs/schedule"
import { PaginatedResult } from "../common/dto/pagination.dto"
import { StreamsGateway } from "../gateways/streams.gateway"
import { Notification } from "./notification.entity"
import { NotificationsRepository } from "./repository/notifications.repository"

export interface PagedNotifications extends PaginatedResult<Notification> {
  unreadCount: number
}

/** How often the expired-notification sweep runs (issue #348). */
const EXPIRY_SWEEP_INTERVAL_MS = 60 * 60 * 1000
/** Cap on rows deleted per batch, so one sweep pass can't lock the table for long. */
const EXPIRY_SWEEP_BATCH_SIZE = 500

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    private readonly notifications: NotificationsRepository,
    @Optional() private readonly gateway?: StreamsGateway,
  ) {}

  /**
   * Create a notification for a user and push it over the `/streams`
   * WebSocket namespace so connected clients update without polling.
   */
  async create(
    userId: number,
    type: string,
    payload: Record<string, unknown> = {},
  ): Promise<Notification> {
    const notification = await this.notifications.create(
      userId,
      type,
      payload,
    )
    this.gateway?.emitNotification({
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      payload: notification.payload,
      createdAt: notification.createdAt.toISOString(),
    })
    return notification
  }

  async listUnread(
    userId: number,
    page: number,
    limit: number,
  ): Promise<PagedNotifications> {
    const { items, total } = await this.notifications.listUnreadPaginated(
      userId,
      page,
      limit,
    )
    return {
      data: items,
      page,
      limit,
      total,
      unreadCount: total,
    }
  }

  async markRead(userId: number, id: number): Promise<Notification> {
    const notification = await this.notifications.markRead(userId, id)
    if (!notification) {
      throw new NotFoundException(`notification ${id} not found`)
    }
    return notification
  }

  async markAllRead(userId: number): Promise<{ updated: number }> {
    const updated = await this.notifications.markAllRead(userId)
    return { updated }
  }

  async delete(userId: number, id: number): Promise<void> {
    const removed = await this.notifications.deleteById(userId, id)
    if (!removed) {
      throw new NotFoundException(`notification ${id} not found`)
    }
  }

  /**
   * Periodic retention sweep (issue #348). Deletes notifications past
   * their `expiresAt` in bounded batches so the table doesn't grow
   * unbounded, without holding a single long-running DELETE.
   */
  @Interval(EXPIRY_SWEEP_INTERVAL_MS)
  async sweepExpired(): Promise<void> {
    let totalDeleted = 0
    let deletedInBatch: number
    do {
      deletedInBatch = await this.notifications.deleteExpiredBatch(
        EXPIRY_SWEEP_BATCH_SIZE,
      )
      totalDeleted += deletedInBatch
    } while (deletedInBatch === EXPIRY_SWEEP_BATCH_SIZE)

    if (totalDeleted > 0) {
      this.logger.log(`Swept ${totalDeleted} expired notification(s)`)
    }
  }
}
