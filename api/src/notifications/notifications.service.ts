import { Injectable, NotFoundException, Optional } from "@nestjs/common"
import { PaginatedResult } from "../common/dto/pagination.dto"
import { StreamsGateway } from "../gateways/streams.gateway"
import { Notification } from "./notification.entity"
import { NotificationsRepository } from "./repository/notifications.repository"

export interface PagedNotifications extends PaginatedResult<Notification> {
  unreadCount: number
}

@Injectable()
export class NotificationsService {
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
}
