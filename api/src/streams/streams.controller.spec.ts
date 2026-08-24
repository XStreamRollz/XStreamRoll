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

import { CreateStreamDto } from "./dto/create-stream.dto"
import { UpdateStreamDto } from "./dto/update-stream.dto"
import { Stream } from "./stream.entity"
import { StreamsController } from "./streams.controller"
import { StreamsService } from "./streams.service"

import type { Cache } from "cache-manager"
import type { Request } from "express"

type MockStreamsService = {
  create: jest.Mock
  list: jest.Mock
  findById: jest.Mock
  getAnalytics: jest.Mock
  update: jest.Mock
  delete: jest.Mock
  listEvents: jest.Mock
  ingestEvent: jest.Mock
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
    visibility: "private",
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
      listEvents: jest.fn(),
      ingestEvent: jest.fn(),
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
      expect.objectContaining({
        id: "1",
        userId: "7",
        name: "s",
        description: "d",
        visibility: "private",
        tags: [],
      }),
    )
    expect(mockService.create).toHaveBeenCalledWith({
      userId: 7,
      name: dto.name,
      visibility: undefined,
    })
  })

  it("create with public visibility (issue #393) passes through and serializes", async () => {
    const dto = { name: "s", description: "d", visibility: "public" as const }
    const req = { auth: { userId: 7 } } as Request & { auth: { userId: number } }
    mockService.create.mockResolvedValue(makeStream({ visibility: "public" }))

    const res = await controller.create(dto, req)
    expect(res).toEqual(expect.objectContaining({ visibility: "public" }))
    expect(mockService.create).toHaveBeenCalledWith({
      userId: 7,
      name: "s",
      description: "d",
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

  it("findById delegates to service and returns a serialized stream", async () => {
    mockService.findById.mockResolvedValue(makeStream({ id: 5 }))
    const res = await controller.findById(5)
    expect(mockService.findById).toHaveBeenCalledWith(5)
    expect(res).toEqual(expect.objectContaining({ id: "5" }))
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

  it("update delegates to service and returns a serialized stream", async () => {
    const dto = { name: "n" }
    mockService.update.mockResolvedValue(makeStream({ id: 9, name: "n" }))
    const res = await controller.update(9, dto as UpdateStreamDto)
    expect(mockService.update).toHaveBeenCalledWith(9, dto)
    expect(res).toEqual(expect.objectContaining({ id: "9", name: "n" }))
  })

  it("update with visibility flip (issue #393) passes through to service", async () => {
    const dto = { visibility: "public" as const }
    mockService.update.mockResolvedValue(makeStream({ id: 9, visibility: "public" }))
    const res = await controller.update(9, dto)
    expect(mockService.update).toHaveBeenCalledWith(9, dto)
    expect(res).toEqual(expect.objectContaining({ visibility: "public" }))
  })

  it("ingest delegates to service and returns the queued event (issue #514)", async () => {
    const pending = {
      streamId: "42",
      data: { viewerId: "u1" },
      timestamp: "2026-08-01T00:00:00.000Z",
    }
    mockService.ingestEvent.mockResolvedValue(pending)

    const res = await controller.ingest({ streamId: "42", data: { viewerId: "u1" } })

    expect(mockService.ingestEvent).toHaveBeenCalledWith({
      streamId: "42",
      data: { viewerId: "u1" },
    })
    expect(res).toEqual(pending)
  })

  it("delete delegates to service and returns void", async () => {
    mockService.delete.mockResolvedValue(undefined)
    await controller.delete(11)
    expect(mockService.delete).toHaveBeenCalledWith(11)
  })

  it("listEvents delegates to service and returns events with stringified streamId", async () => {
    mockService.listEvents.mockResolvedValue({
      data: [
        {
          id: "1",
          streamId: "1",
          eventType: "viewer:joined",
          payload: { viewerId: "u1" },
          occurredAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      page: 1,
      limit: 50,
      total: 1,
      hasMore: false,
    })
    const res = await controller.listEvents(1)
    expect(mockService.listEvents).toHaveBeenCalledWith(1, 1, 50)
    expect(res.data[0]).toEqual(
      expect.objectContaining({
        id: "1",
        streamId: "1",
        eventType: "viewer:joined",
        occurredAt: "2026-08-01T00:00:00.000Z",
      }),
    )
    expect(res.hasMore).toBe(false)
  })

  it("listEvents paginates non-trivial totals", async () => {
    mockService.listEvents.mockResolvedValue({
      data: [],
      page: 2,
      limit: 25,
      total: 51,
      hasMore: true,
    })
    const res = await controller.listEvents(1, 2, 25)
    expect(mockService.listEvents).toHaveBeenCalledWith(1, 2, 25)
    expect(res.hasMore).toBe(true)
    expect(res.total).toBe(51)
  })
})
