import { Injectable } from "@nestjs/common"
import { Notification } from "../notification.entity"

/**
 * In-memory notifications repository.
 *
 * Kept for unit testing and local development without a database. The
 * service layer depends on this class as an injection token rather than a
 * concrete implementation, so tests can swap in the DB-backed repository
 * via the NestJS DI container.
 */
@Injectable()
export class NotificationsRepository {
  private readonly byId = new Map<number, Notification>()
  private nextId = 1

  async create(
    userId: number,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<Notification> {
    const notification: Notification = {
      id: this.nextId++,
      userId,
      type,
      payload,
      readAt: null,
      createdAt: new Date(),
    }
    this.byId.set(notification.id, notification)
    return notification
  }

  async findById(id: number): Promise<Notification | undefined> {
    return this.byId.get(id)
  }

  /**
   * Returns a page of the user's unread notifications, newest first, plus
   * the total count of unread notifications matching the filter.
   */
  async listUnreadPaginated(
    userId: number,
    page: number,
    limit: number,
  ): Promise<{ items: Notification[]; total: number }> {
    const unread = Array.from(this.byId.values())
      .filter((n) => n.userId === userId && n.readAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    const offset = (page - 1) * limit
    return {
      items: unread.slice(offset, offset + limit),
      total: unread.length,
    }
  }

  async markRead(
    userId: number,
    id: number,
  ): Promise<Notification | undefined> {
    const notification = this.byId.get(id)
    if (!notification || notification.userId !== userId) return undefined
    if (!notification.readAt) {
      notification.readAt = new Date()
    }
    return notification
  }

  async markAllRead(userId: number): Promise<number> {
    let count = 0
    const now = new Date()
    for (const notification of this.byId.values()) {
      if (notification.userId === userId && !notification.readAt) {
        notification.readAt = now
        count++
      }
    }
    return count
  }

  async deleteById(userId: number, id: number): Promise<boolean> {
    const notification = this.byId.get(id)
    if (!notification || notification.userId !== userId) return false
    return this.byId.delete(id)
  }
}
