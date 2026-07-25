// Prevent loading the guard implementation, which triggers env validation
// at import time (see streams.controller.spec.ts for the same pattern).
jest.mock("../common/guards/auth.guard", () => ({
  AuthGuard: class {
    canActivate() {
      return true
    }
  },
}))

import type { Request } from "express"
import { NotificationsController } from "./notifications.controller"
import { NotificationsService } from "./notifications.service"

const makeReq = (userId: number): Request & { auth: { userId: number } } =>
  ({ auth: { userId } }) as Request & { auth: { userId: number } }

describe("NotificationsController", () => {
  let controller: NotificationsController
  let service: jest.Mocked<
    Pick<
      NotificationsService,
      "listUnread" | "markRead" | "markAllRead" | "delete"
    >
  >

  beforeEach(() => {
    service = {
      listUnread: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
      delete: jest.fn(),
    }

    controller = new NotificationsController(service as any)
  })

  it("lists unread notifications with defaults and the caller's userId", async () => {
    service.listUnread.mockResolvedValue({
      data: [],
      page: 1,
      limit: 20,
      total: 0,
      unreadCount: 0,
    })

    await controller.list({}, makeReq(7))

    expect(service.listUnread).toHaveBeenCalledWith(7, 1, 20)
  })

  it("forwards explicit page and limit", async () => {
    service.listUnread.mockResolvedValue({
      data: [],
      page: 2,
      limit: 5,
      total: 0,
      unreadCount: 0,
    })

    await controller.list({ page: 2, limit: 5 }, makeReq(7))

    expect(service.listUnread).toHaveBeenCalledWith(7, 2, 5)
  })

  it("marks a single notification as read for the caller", async () => {
    await controller.markRead(3, makeReq(7))

    expect(service.markRead).toHaveBeenCalledWith(7, 3)
  })

  it("marks all notifications as read for the caller", async () => {
    await controller.markAllRead(makeReq(7))

    expect(service.markAllRead).toHaveBeenCalledWith(7)
  })

  it("deletes a notification for the caller", async () => {
    await controller.delete(3, makeReq(7))

    expect(service.delete).toHaveBeenCalledWith(7, 3)
  })
})
