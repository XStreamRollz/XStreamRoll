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

import { ForbiddenException, NotFoundException } from "@nestjs/common"
import type { Request } from "express"
import { WebhooksController } from "./webhooks.controller"
import { WebhooksService } from "./webhooks.service"
import { StreamOwnershipService } from "../common/guards/stream-ownership.service"

const makeReq = (userId: number): Request & { auth: { userId: number } } =>
  ({ auth: { userId } }) as Request & { auth: { userId: number } }

describe("WebhooksController", () => {
  let controller: WebhooksController
  let service: jest.Mocked<Pick<WebhooksService, "register" | "findById" | "listDeliveries">>
  let ownership: jest.Mocked<Pick<StreamOwnershipService, "ownsStream">>

  beforeEach(() => {
    service = {
      register: jest.fn(),
      findById: jest.fn(),
      listDeliveries: jest.fn(),
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
      service.register.mockResolvedValue({
        id: 1,
        userId: 7,
        streamId: 5,
        url: dto.url,
        events: dto.events,
        secret: "abc",
        active: true,
        createdAt: new Date(),
      })

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

  describe("listDeliveries", () => {
    it("returns the delivery log when the caller owns the webhook", async () => {
      service.findById.mockResolvedValue({
        id: 1,
        userId: 7,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
        secret: "abc",
        active: true,
        createdAt: new Date(),
      })
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
      service.findById.mockResolvedValue({
        id: 1,
        userId: 7,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
        secret: "abc",
        active: true,
        createdAt: new Date(),
      })
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
      service.findById.mockResolvedValue({
        id: 1,
        userId: 42,
        streamId: 5,
        url: "https://example.com/hook",
        events: ["stream:started"],
        secret: "abc",
        active: true,
        createdAt: new Date(),
      })

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
})
