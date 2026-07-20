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

import { StreamsController } from "./streams.controller"
import { CreateStreamDto } from "./dto/create-stream.dto"
import { UpdateStreamDto } from "./dto/update-stream.dto"
import { StreamsService } from "./streams.service"
import type { Request } from "express"
import type { Cache } from "cache-manager"

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

  it("create delegates to service with auth userId", async () => {
    const dto = { name: "s", description: "d", visibility: "public" as const }
    const req = { auth: { userId: 7 } } as Request & { auth: { userId: number } }
    const expected = { id: 1 }
    mockService.create.mockResolvedValue(expected)

    const res = await controller.create(dto as CreateStreamDto, req)
    expect(res).toBe(expected)
    expect(mockService.create).toHaveBeenCalledWith({
      userId: 7,
      name: dto.name,
      description: dto.description,
      visibility: "public",
    })
  })

  it("list delegates to service with viewerUserId, status, visibility, and ownerOnly defaults", async () => {
    mockService.list.mockResolvedValue({ data: [], page: 1, limit: 20, total: 0, hasMore: false })
    const req = { auth: { userId: 9 } } as Request & { auth: { userId: number } }
    const res = await controller.list({}, req)
    expect(mockService.list).toHaveBeenCalledWith(1, 20, 9, {
      status: undefined,
      visibility: undefined,
      ownerOnly: undefined,
    })
    expect(res.data).toBeDefined()
  })

  it("list forwards visibility and ownerOnly flags", async () => {
    mockService.list.mockResolvedValue({ data: [], page: 1, limit: 20, total: 0, hasMore: false })
    const req = { auth: { userId: 9 } } as Request & { auth: { userId: number } }
    await controller.list(
      { visibility: "private", ownerOnly: true, status: "active", page: 2, limit: 50 },
      req,
    )
    expect(mockService.list).toHaveBeenCalledWith(2, 50, 9, {
      status: "active",
      visibility: "private",
      ownerOnly: true,
    })
  })

  it("findById delegates to service", async () => {
    mockService.findById.mockResolvedValue({ id: 5 })
    const res = await controller.findById(5)
    expect(mockService.findById).toHaveBeenCalledWith(5)
    expect(res).toEqual({ id: 5 })
  })

  it("getAnalytics returns cached analytics when available", async () => {
    const cached = { streamId: 5, totalEventsProcessed: { last24h: 1, last7d: 2, last30d: 3 } } as unknown as Awaited<ReturnType<typeof controller.getAnalytics>>
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

  it("update delegates to service", async () => {
    const dto = { name: "n" }
    mockService.update.mockResolvedValue({ id: 9 })
    const res = await controller.update(9, dto as UpdateStreamDto)
    expect(mockService.update).toHaveBeenCalledWith(9, dto)
    expect(res).toEqual({ id: 9 })
  })

  it("delete delegates to service and returns void", async () => {
    mockService.delete.mockResolvedValue(undefined)
    await controller.delete(11)
    expect(mockService.delete).toHaveBeenCalledWith(11)
  })
})
