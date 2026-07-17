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

describe("StreamsController", () => {
  let controller: StreamsController
  let mockService: any
  let mockCache: any

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
    controller = new StreamsController(mockService, mockCache)
  })

  it("create delegates to service with auth userId", async () => {
    const dto = { name: "s", description: "d" }
    const req: any = { auth: { userId: 7 } }
    const expected = { id: 1 }
    mockService.create.mockResolvedValue(expected)

    const res = await controller.create(dto as any, req)
    expect(res).toBe(expected)
    expect(mockService.create).toHaveBeenCalledWith({ userId: 7, name: dto.name, description: dto.description })
  })

  it("list delegates to service with defaults", async () => {
    mockService.list.mockResolvedValue({ data: [], page: 1, limit: 20, total: 0, hasMore: false })
    const res = await controller.list({} as any)
    expect(mockService.list).toHaveBeenCalledWith(1, 20, { status: undefined })
    expect(res.data).toBeDefined()
  })

  it("findById delegates to service", async () => {
    mockService.findById.mockResolvedValue({ id: 5 })
    const res = await controller.findById(5)
    expect(mockService.findById).toHaveBeenCalledWith(5)
    expect(res).toEqual({ id: 5 })
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

  it("update delegates to service", async () => {
    const dto = { name: "n" }
    mockService.update.mockResolvedValue({ id: 9 })
    const res = await controller.update(9, dto as any)
    expect(mockService.update).toHaveBeenCalledWith(9, dto)
    expect(res).toEqual({ id: 9 })
  })

  it("delete delegates to service and returns void", async () => {
    mockService.delete.mockResolvedValue(undefined)
    await controller.delete(11)
    expect(mockService.delete).toHaveBeenCalledWith(11)
  })
})
