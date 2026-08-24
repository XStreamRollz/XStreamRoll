// Prevent loading the guard/service implementations, which trigger env
// validation at import time (see streams.controller.spec.ts for the same
// pattern). StreamOwnershipService additionally opens its own PG pool in
// its constructor, which we also want to avoid in a unit test.
jest.mock("../common/guards/auth.guard", () => ({
  AuthGuard: class {
    canActivate() {
      return true
    }
  },
}))
jest.mock("../common/guards/stream-ownership.service", () => ({
  StreamOwnershipService: class {
    ownsStream() {
      return Promise.resolve(true)
    }
  },
}))

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common"

import { WebhookSubscription } from "./webhook-subscription.entity"
import { WebhooksController } from "./webhooks.controller"
import { WebhooksService } from "./webhooks.service"
import { StreamOwnershipService } from "../common/guards/stream-ownership.service"

import type { Request } from "express"

const makeReq = (userId: number): Request & { auth: { userId: number } } =>
  ({ auth: { userId } }) as Request & { auth: { userId: number } }

/** Fully-typed subscription fixture, including the secret. */
function subscriptionFixture(overrides: Partial<WebhookSubscription> = {}): WebhookSubscription {
  return {
    id: 1,
    userId: 7,
    streamId: 5,
    url: "https://example.com/hook",
    events: ["stream:started"],
    secret: "top-secret",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

describe("WebhooksController", () => {
  let controller: WebhooksController
  let service: jest.Mocked<
    Pick<
      WebhooksService,
      "register" | "findById" | "listDeliveries" | "listByUser" | "update" | "delete" | "retryDelivery"
    >
  >
  let ownership: jest.Mocked<Pick<StreamOwnershipService, "ownsStream">>

  beforeEach(() => {
    service = {
      register: jest.fn(),
      findById: jest.fn(),
      listDeliveries: jest.fn(),
      listByUser: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      retryDelivery: jest.fn(),
    }
    ownership = {
      ownsStream: jest.fn(),
    }
    controller = new WebhooksController(
      service as unknown as WebhooksService,
      ownership as unknown as StreamOwnershipService,
    )
  })

  describe("create", () => {
    const dto = {
      streamId: 5,
      url: "https://example.com/hook",
      events: ["stream:started"],
    }

    it("registers a webhook when the caller owns the stream", async () => {
      ownership.ownsStream.mockResolvedValue(true)
      service.register.mockResolvedValue(subscriptionFixture())

      await controller.create(dto, makeReq(7))

      expect(ownership.ownsStream).toHaveBeenCalledWith(7, 5)
      expect(service.register).toHaveBeenCalledWith({
        userId: 7,
        streamId: 5,
        url: dto.url,
        events: dto.events,
      })
    })

    it("rejects when the caller does not own the stream", async () => {
      ownership.ownsStream.mockResolvedValue(false)

      await expect(controller.create(dto, makeReq(7))).rejects.toThrow(
        ForbiddenException,
      )
      expect(service.register).not.toHaveBeenCalled()
    })
  })

  describe("list", () => {
    it("returns the caller's subscriptions with the secret stripped", async () => {
      service.listByUser.mockResolvedValue({
        data: [subscriptionFixture(), subscriptionFixture({ id: 2 })],
        page: 1,
        limit: 20,
        total: 2,
      })

      const result = await controller.list({}, makeReq(7))

      expect(service.listByUser).toHaveBeenCalledWith(7, 1, 20, undefined)
      expect(result.total).toBe(2)
      for (const item of result.data) {
        expect(item).not.toHaveProperty("secret")
      }
    })

    it("forwards page, limit, and the streamId filter", async () => {
      service.listByUser.mockResolvedValue({ data: [], page: 2, limit: 5, total: 0 })

      await controller.list({ page: 2, limit: 5, streamId: 9 }, makeReq(7))

      expect(service.listByUser).toHaveBeenCalledWith(7, 2, 5, 9)
    })
  })

  describe("update", () => {
    it("updates url/events/active and returns the subscription without a secret", async () => {
      service.findById.mockResolvedValue(subscriptionFixture())
      service.update.mockResolvedValue(
        subscriptionFixture({ url: "https://example.com/new", active: false }),
      )

      const result = await controller.update(
        1,
        { url: "https://example.com/new", active: false },
        makeReq(7),
      )

      expect(service.update).toHaveBeenCalledWith(1, {
        url: "https://example.com/new",
        events: undefined,
        active: false,
      })
      expect(result).not.toHaveProperty("secret")
      expect(result.url).toBe("https://example.com/new")
    })

    it("rejects an empty body with BadRequestException", async () => {
      service.findById.mockResolvedValue(subscriptionFixture())

      await expect(controller.update(1, {}, makeReq(7))).rejects.toThrow(
        BadRequestException,
      )
      expect(service.update).not.toHaveBeenCalled()
    })

    it("rejects when the caller does not own the webhook", async () => {
      service.findById.mockResolvedValue(subscriptionFixture({ userId: 42 }))

      await expect(
        controller.update(1, { active: false }, makeReq(7)),
      ).rejects.toThrow(ForbiddenException)
      expect(service.update).not.toHaveBeenCalled()
    })
  })

  describe("delete", () => {
    it("deletes the subscription when the caller owns it", async () => {
      service.findById.mockResolvedValue(subscriptionFixture())
      service.delete.mockResolvedValue(undefined)

      await controller.delete(1, makeReq(7))

      expect(service.delete).toHaveBeenCalledWith(1)
    })

    it("rejects when the caller does not own the webhook", async () => {
      service.findById.mockResolvedValue(subscriptionFixture({ userId: 42 }))

      await expect(controller.delete(1, makeReq(7))).rejects.toThrow(
        ForbiddenException,
      )
      expect(service.delete).not.toHaveBeenCalled()
    })

    it("propagates NotFoundException for an unknown webhook", async () => {
      service.findById.mockRejectedValue(new NotFoundException("webhook 999 not found"))

      await expect(controller.delete(999, makeReq(7))).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe("listDeliveries", () => {
    it("returns the delivery log when the caller owns the webhook", async () => {
      service.findById.mockResolvedValue(subscriptionFixture())
      service.listDeliveries.mockResolvedValue({
        data: [],
        page: 1,
        limit: 20,
        total: 0,
      })

      await controller.listDeliveries(1, {}, makeReq(7))

      expect(service.listDeliveries).toHaveBeenCalledWith(1, 1, 20)
    })

    it("forwards explicit page and limit", async () => {
      service.findById.mockResolvedValue(subscriptionFixture())
      service.listDeliveries.mockResolvedValue({
        data: [],
        page: 2,
        limit: 5,
        total: 0,
      })

      await controller.listDeliveries(1, { page: 2, limit: 5 }, makeReq(7))

      expect(service.listDeliveries).toHaveBeenCalledWith(1, 2, 5)
    })

    it("rejects when the caller does not own the webhook", async () => {
      service.findById.mockResolvedValue(subscriptionFixture({ userId: 42 }))

      await expect(
        controller.listDeliveries(1, {}, makeReq(7)),
      ).rejects.toThrow(ForbiddenException)
      expect(service.listDeliveries).not.toHaveBeenCalled()
    })

    it("propagates NotFoundException for an unknown webhook", async () => {
      service.findById.mockRejectedValue(new NotFoundException("webhook 999 not found"))

      await expect(
        controller.listDeliveries(999, {}, makeReq(7)),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe("retryDelivery", () => {
    it("re-queues a failed delivery when the caller owns the webhook", async () => {
      service.findById.mockResolvedValue(subscriptionFixture())
      service.retryDelivery.mockResolvedValue({
        id: 10,
        webhookSubscriptionId: 1,
        event: "stream:started",
        payload: { streamId: 5 },
        status: "pending",
        attemptCount: 6,
        lastStatusCode: null,
        lastResponseBody: null,
        lastError: "connection refused",
        nextAttemptAt: new Date(),
        deliveredAt: null,
        createdAt: new Date(),
      })

      const result = await controller.retryDelivery(1, 10, makeReq(7))

      expect(service.retryDelivery).toHaveBeenCalledWith(1, 10)
      expect(result.status).toBe("pending")
    })

    it("rejects when the caller does not own the webhook", async () => {
      service.findById.mockResolvedValue(subscriptionFixture({ userId: 42 }))

      await expect(controller.retryDelivery(1, 10, makeReq(7))).rejects.toThrow(
        ForbiddenException,
      )
      expect(service.retryDelivery).not.toHaveBeenCalled()
    })

    it("propagates NotFoundException for an unknown delivery", async () => {
      service.findById.mockResolvedValue(subscriptionFixture())
      service.retryDelivery.mockRejectedValue(
        new NotFoundException("delivery 10 not found for webhook 1"),
      )

      await expect(controller.retryDelivery(1, 10, makeReq(7))).rejects.toThrow(
        NotFoundException,
      )
    })

    it("propagates ConflictException for an already-delivered delivery", async () => {
      service.findById.mockResolvedValue(subscriptionFixture())
      service.retryDelivery.mockRejectedValue(
        new ConflictException("delivery 10 was already delivered"),
      )

      await expect(controller.retryDelivery(1, 10, makeReq(7))).rejects.toThrow(
        ConflictException,
      )
    })
  })
})
