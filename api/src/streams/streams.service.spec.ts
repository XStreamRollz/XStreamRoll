import { ConflictException, NotFoundException } from "@nestjs/common"
import { StreamsService } from "./streams.service"
import { Stream } from "./stream.entity"
import { StreamsRepository } from "./repository/streams.repository"

describe("StreamsService", () => {
  let service: StreamsService
  let mockRepo: {
    create: jest.Mock
    listPaginated: jest.Mock
    findById: jest.Mock
    getAnalytics: jest.Mock
    update: jest.Mock
    delete: jest.Mock
  }

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      listPaginated: jest.fn(),
      findById: jest.fn(),
      getAnalytics: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }
    service = new StreamsService(mockRepo as unknown as StreamsRepository)
  })

  it("create with valid data returns stream", async () => {
    const expected: Stream = {
      id: 1,
      userId: 5,
      name: "My Stream",
      description: "desc",
      status: "inactive",
      visibility: "private",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockRepo.create.mockResolvedValue(expected)

    const result = await service.create({ userId: 5, name: "My Stream", description: "desc" })
    expect(result).toEqual(expected)
    expect(mockRepo.create).toHaveBeenCalledWith({ userId: 5, name: "My Stream", description: "desc", visibility: undefined })
  })

  it("create forwards explicit visibility to the repository", async () => {
    const expected: Stream = {
      id: 1,
      userId: 5,
      name: "My Stream",
      description: null,
      status: "inactive",
      visibility: "public",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockRepo.create.mockResolvedValue(expected)

    await service.create({ userId: 5, name: "My Stream", visibility: "public" })
    expect(mockRepo.create).toHaveBeenCalledWith({
      userId: 5,
      name: "My Stream",
      description: undefined,
      visibility: "public",
    })
  })

  it("list streams with pagination returns correct shape and hasMore", async () => {
    const items: Stream[] = [
      { id: 1, userId: 1, name: "a", description: null, status: "inactive", visibility: "public", createdAt: new Date(), updatedAt: new Date() },
      { id: 2, userId: 2, name: "b", description: null, status: "inactive", visibility: "public", createdAt: new Date(), updatedAt: new Date() },
    ]
    mockRepo.listPaginated.mockResolvedValue({ items, total: 3 })

    const page = 1
    const limit = 2
    const res = await service.list(page, limit, 1)
    expect(res.data).toBe(items)
    expect(res.page).toBe(page)
    expect(res.limit).toBe(limit)
    expect(res.total).toBe(3)
    expect(res.hasMore).toBe(true)
  })

  it("list streams forwards viewer userId and status filter to repository", async () => {
    const items: Stream[] = []
    mockRepo.listPaginated.mockResolvedValue({ items, total: 0 })

    await service.list(1, 10, 42, { status: "active" })
    expect(mockRepo.listPaginated).toHaveBeenCalledWith(1, 10, 42, { status: "active" })
  })

  it("list streams forwards visibility filter and ownerOnly flag", async () => {
    const items: Stream[] = []
    mockRepo.listPaginated.mockResolvedValue({ items, total: 0 })

    await service.list(1, 10, 7, { visibility: "private", ownerOnly: true })
    expect(mockRepo.listPaginated).toHaveBeenCalledWith(1, 10, 7, {
      visibility: "private",
      ownerOnly: true,
    })
  })

  it("list with invalid viewerUserId rejects", async () => {
    await expect(service.list(1, 10, 0)).rejects.toThrow(NotFoundException)
    await expect(service.list(1, 10, -1)).rejects.toThrow(NotFoundException)
    await expect(service.list(1, 10, 1.5)).rejects.toThrow(NotFoundException)
    expect(mockRepo.listPaginated).not.toHaveBeenCalled()
  })

  it("findById missing stream throws NotFoundException", async () => {
    mockRepo.findById.mockResolvedValue(undefined)
    await expect(service.findById(123)).rejects.toThrow(NotFoundException)
  })

  it("update status inactive -> active succeeds", async () => {
    const existing: Stream = { id: 1, userId: 1, name: "s", description: null, status: "inactive", visibility: "private", createdAt: new Date(), updatedAt: new Date() }
    const updated: Stream = { ...existing, status: "active" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    const res = await service.update(1, { status: "active" })
    expect(res).toEqual(updated)
    expect(mockRepo.update).toHaveBeenCalledWith(1, { name: undefined, description: undefined, status: "active", visibility: undefined })
  })

  it("update visibility flips public <-> private", async () => {
    const existing: Stream = { id: 4, userId: 1, name: "s", description: null, status: "inactive", visibility: "private", createdAt: new Date(), updatedAt: new Date() }
    const updated: Stream = { ...existing, visibility: "public" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    const res = await service.update(4, { visibility: "public" })
    expect(res).toEqual(updated)
    expect(mockRepo.update).toHaveBeenCalledWith(4, {
      name: undefined,
      description: undefined,
      status: undefined,
      visibility: "public",
    })
  })

  it("update status active -> active throws ConflictException", async () => {
    const existing: Stream = { id: 2, userId: 1, name: "s", description: null, status: "active", visibility: "private", createdAt: new Date(), updatedAt: new Date() }
    mockRepo.findById.mockResolvedValue(existing)
    await expect(service.update(2, { status: "active" })).rejects.toThrow(ConflictException)
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it("update status error -> active throws ConflictException", async () => {
    const existing: Stream = { id: 3, userId: 1, name: "s", description: null, status: "error", visibility: "private", createdAt: new Date(), updatedAt: new Date() }
    mockRepo.findById.mockResolvedValue(existing)
    await expect(service.update(3, { status: "active" })).rejects.toThrow(ConflictException)
  })

  it("delete existing stream resolves", async () => {
    mockRepo.delete.mockResolvedValue(true)
    await expect(service.delete(1)).resolves.toBeUndefined()
  })

  it("delete non-existent stream throws NotFoundException", async () => {
    mockRepo.delete.mockResolvedValue(false)
    await expect(service.delete(999)).rejects.toThrow(NotFoundException)
  })

  it("getAnalytics checks stream existence before loading analytics", async () => {
    const stream: Stream = {
      id: 4,
      userId: 1,
      name: "s",
      description: null,
      status: "active",
      visibility: "private",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const analytics = {
      streamId: 4,
      totalEventsProcessed: { last24h: 1, last7d: 2, last30d: 3 },
      errorRate: { window: "30d", totalEvents: 3, errorEvents: 1, percentage: 33.33 },
      processingLatency: { window: "30d", averageMs: 10, p99Ms: 25 },
      eventsPerMinute: [],
      generatedAt: new Date().toISOString(),
    }
    mockRepo.findById.mockResolvedValue(stream)
    mockRepo.getAnalytics.mockResolvedValue(analytics)

    await expect(service.getAnalytics(4)).resolves.toBe(analytics)
    expect(mockRepo.findById).toHaveBeenCalledWith(4)
    expect(mockRepo.getAnalytics).toHaveBeenCalledWith(4)
  })

  it("getAnalytics missing stream throws NotFoundException", async () => {
    mockRepo.findById.mockResolvedValue(undefined)

    await expect(service.getAnalytics(404)).rejects.toThrow(NotFoundException)
    expect(mockRepo.getAnalytics).not.toHaveBeenCalled()
  })
})
