// Prevent loading guard implementations which trigger env validation at import time.
jest.mock("../common/guards/stream-ownership.guard", () => ({
  StreamOwnershipGuard: class {
    canActivate() {
      return true
    }
  },
}))
jest.mock("../common/guards/auth.guard", () => ({
  AuthGuard: class {
    canActivate() {
      return true
    }
  },
}))

import type { Cache } from "cache-manager"
import type { Request } from "express"
import { StreamsController } from "./streams.controller"
import { CreateStreamDto } from "./dto/create-stream.dto"
import { UpdateStreamDto } from "./dto/update-stream.dto"
import { Stream } from "./stream.entity"
import { StreamsService } from "./streams.service"

type MockStreamsService = {
  create: jest.Mock
  list: jest.Mock
  findById: jest.Mock
  getAnalytics: jest.Mock
  update: jest.Mock
  delete: jest.Mock
}

type MockCache = {
  get: jest.Mock
  set: jest.Mock
}

function makeStream(overrides: Partial<Stream> = {}): Stream {
  return {
    id: 1,
    userId: 7,
    name: "s",
    description: "d",
    status: "inactive",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

describe("StreamsController", () => {
  let controller: StreamsController
  let mockService: MockStreamsService
  let mockCache: MockCache

  beforeEach(() => {
    mockService = {
      create: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      getAnalytics: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
    }
    controller = new StreamsController(
      mockService as unknown as StreamsService,
      mockCache as unknown as Cache,
    )
  })

  it("create delegates to service with auth userId and returns a serialized stream", async () => {
    const dto = { name: "s", description: "d" }
    const req = { auth: { userId: 7 } } as Request & { auth: { userId: number } }
    mockService.create.mockResolvedValue(makeStream())

    const res = await controller.create(dto as CreateStreamDto, req)
    expect(res).toEqual(
      expect.objectContaining({ id: "1", userId: "7", name: "s", description: "d" }),
    )
    expect(mockService.create).toHaveBeenCalledWith({ userId: 7, name: dto.name, description: dto.description })
  })

  it("list delegates to service with defaults and serializes each stream", async () => {
    mockService.list.mockResolvedValue({
      data: [makeStream({ id: 2 })],
      page: 1,
      limit: 20,
      total: 1,
      hasMore: false,
    })
    const res = await controller.list({})
    expect(mockService.list).toHaveBeenCalledWith(1, 20, { status: undefined })
    expect(res.data).toEqual([expect.objectContaining({ id: "2" })])
  })

  it("findById delegates to service and returns a serialized stream", async () => {
    mockService.findById.mockResolvedValue(makeStream({ id: 5 }))
    const res = await controller.findById(5)
    expect(mockService.findById).toHaveBeenCalledWith(5)
    expect(res).toEqual(expect.objectContaining({ id: "5" }))
  })

  it("getAnalytics returns cached analytics when available", async () => {
    const cached = { streamId: 5, totalEventsProcessed: { last24h: 1, last7d: 2, last30d: 3 } }
    mockCache.get.mockResolvedValue(cached)

    const res = await controller.getAnalytics(5)

    expect(res).toBe(cached)
    expect(mockCache.get).toHaveBeenCalledWith("streams:5:analytics")
    expect(mockService.getAnalytics).not.toHaveBeenCalled()
  })

  it("getAnalytics delegates and caches fresh analytics", async () => {
    const analytics = { streamId: 5, totalEventsProcessed: { last24h: 1, last7d: 2, last30d: 3 } }
    mockCache.get.mockResolvedValue(undefined)
    mockService.getAnalytics.mockResolvedValue(analytics)

    const res = await controller.getAnalytics(5)

    expect(res).toBe(analytics)
    expect(mockService.getAnalytics).toHaveBeenCalledWith(5)
    expect(mockCache.set).toHaveBeenCalledWith("streams:5:analytics", analytics, 60000)
  })

  it("update delegates to service and returns a serialized stream", async () => {
    const dto = { name: "n" }
    mockService.update.mockResolvedValue(makeStream({ id: 9, name: "n" }))
    const res = await controller.update(9, dto as UpdateStreamDto)
    expect(mockService.update).toHaveBeenCalledWith(9, dto)
    expect(res).toEqual(expect.objectContaining({ id: "9", name: "n" }))
  })

  it("delete delegates to service and returns void", async () => {
    mockService.delete.mockResolvedValue(undefined)
    await controller.delete(11)
    expect(mockService.delete).toHaveBeenCalledWith(11)
  })
})
