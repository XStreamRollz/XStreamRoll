import { NotFoundException } from "@nestjs/common"
import { NotificationsService } from "./notifications.service"
import { NotificationsRepository } from "./repository/notifications.repository"

describe("NotificationsService", () => {
  let service: NotificationsService
  let repo: NotificationsRepository
  let gateway: { emitNotification: jest.Mock }

  beforeEach(() => {
    repo = new NotificationsRepository()
    gateway = { emitNotification: jest.fn() }
    service = new NotificationsService(repo, gateway as any)
  })

  describe("create", () => {
    it("persists the notification and pushes it over the gateway", async () => {
      const notification = await service.create(1, "stream:error", {
        streamId: "5",
      })

      expect(notification.userId).toBe(1)
      expect(notification.type).toBe("stream:error")
      expect(notification.readAt).toBeNull()
      expect(gateway.emitNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          id: notification.id,
          userId: 1,
          type: "stream:error",
          payload: { streamId: "5" },
        }),
      )
    })
  })

  describe("listUnread", () => {
    it("returns only the requesting user's unread notifications", async () => {
      await service.create(1, "a")
      await service.create(1, "b")
      await service.create(2, "c")

      const page = await service.listUnread(1, 1, 20)

      expect(page.data).toHaveLength(2)
      expect(page.total).toBe(2)
      expect(page.unreadCount).toBe(2)
    })

    it("excludes notifications already marked as read", async () => {
      const n = await service.create(1, "a")
      await service.markRead(1, n.id)

      const page = await service.listUnread(1, 1, 20)

      expect(page.data).toHaveLength(0)
      expect(page.unreadCount).toBe(0)
    })
  })

  describe("markRead", () => {
    it("marks a notification owned by the user as read", async () => {
      const n = await service.create(1, "a")

      const updated = await service.markRead(1, n.id)

      expect(updated.readAt).not.toBeNull()
    })

    it("throws NotFoundException for a notification owned by another user", async () => {
      const n = await service.create(1, "a")

      await expect(service.markRead(2, n.id)).rejects.toThrow(
        NotFoundException,
      )
    })

    it("throws NotFoundException for a missing notification", async () => {
      await expect(service.markRead(1, 999)).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe("markAllRead", () => {
    it("marks every unread notification for the user and reports the count", async () => {
      await service.create(1, "a")
      await service.create(1, "b")
      await service.create(2, "c")

      const result = await service.markAllRead(1)

      expect(result).toEqual({ updated: 2 })
      const page = await service.listUnread(1, 1, 20)
      expect(page.data).toHaveLength(0)
    })
  })

  describe("delete", () => {
    it("deletes a notification owned by the user", async () => {
      const n = await service.create(1, "a")

      await service.delete(1, n.id)

      await expect(service.markRead(1, n.id)).rejects.toThrow(
        NotFoundException,
      )
    })

    it("throws NotFoundException when deleting another user's notification", async () => {
      const n = await service.create(1, "a")

      await expect(service.delete(2, n.id)).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe("sweepExpired", () => {
    it("sets a 30-day expiry on create", async () => {
      const before = Date.now()
      const n = await service.create(1, "a")
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

      expect(n.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + thirtyDaysMs - 1000,
      )
      expect(n.expiresAt.getTime()).toBeLessThanOrEqual(
        before + thirtyDaysMs + 1000,
      )
    })

    it("deletes notifications past their expiry and leaves others intact", async () => {
      const n = await service.create(1, "a")
      n.expiresAt = new Date(Date.now() - 1000)

      await service.sweepExpired()

      await expect(service.markRead(1, n.id)).rejects.toThrow(
        NotFoundException,
      )
    })

    it("does not delete notifications that haven't expired yet", async () => {
      const n = await service.create(1, "a")

      await service.sweepExpired()

      const updated = await service.markRead(1, n.id)
      expect(updated.id).toBe(n.id)
    })
  })
})
