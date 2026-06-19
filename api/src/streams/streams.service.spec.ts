import { ConflictException, NotFoundException } from "@nestjs/common"
import { StreamsService } from "./streams.service"
import { Stream } from "./stream.entity"

describe("StreamsService", () => {
  let service: StreamsService
  let mockRepo: any

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      listPaginated: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }
    service = new StreamsService(mockRepo)
  })

  it("create with valid data returns stream", async () => {
    const expected: Stream = {
      id: 1,
      userId: 5,
      name: "My Stream",
      description: "desc",
      status: "inactive",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockRepo.create.mockResolvedValue(expected)

    const result = await service.create({ userId: 5, name: "My Stream", description: "desc" })
    expect(result).toEqual(expected)
    expect(mockRepo.create).toHaveBeenCalledWith({ userId: 5, name: "My Stream", description: "desc" })
  })

  it("list streams with pagination returns correct shape and hasMore", async () => {
    const items: Stream[] = [
      { id: 1, userId: 1, name: "a", description: null, status: "inactive", createdAt: new Date(), updatedAt: new Date() },
      { id: 2, userId: 2, name: "b", description: null, status: "inactive", createdAt: new Date(), updatedAt: new Date() },
    ]
    mockRepo.listPaginated.mockResolvedValue({ items, total: 3 })

    const page = 1
    const limit = 2
    const res = await service.list(page, limit)
    expect(res.data).toBe(items)
    expect(res.page).toBe(page)
    expect(res.limit).toBe(limit)
    expect(res.total).toBe(3)
    expect(res.hasMore).toBe(true)
  })

  it("list streams with status filter forwards filter", async () => {
    const items: Stream[] = []
    mockRepo.listPaginated.mockResolvedValue({ items, total: 0 })

    await service.list(1, 10, { status: "active" })
    expect(mockRepo.listPaginated).toHaveBeenCalledWith(1, 10, { status: "active" })
  })

  it("findById missing stream throws NotFoundException", async () => {
    mockRepo.findById.mockResolvedValue(undefined)
    await expect(service.findById(123)).rejects.toThrow(NotFoundException)
  })

  it("update status inactive -> active succeeds", async () => {
    const existing: Stream = { id: 1, userId: 1, name: "s", description: null, status: "inactive", createdAt: new Date(), updatedAt: new Date() }
    const updated: Stream = { ...existing, status: "active" }
    mockRepo.findById.mockResolvedValue(existing)
    mockRepo.update.mockResolvedValue(updated)

    const res = await service.update(1, { status: "active" })
    expect(res).toEqual(updated)
    expect(mockRepo.update).toHaveBeenCalledWith(1, { name: undefined, description: undefined, status: "active" })
  })

  it("update status active -> active throws ConflictException", async () => {
    const existing: Stream = { id: 2, userId: 1, name: "s", description: null, status: "active", createdAt: new Date(), updatedAt: new Date() }
    mockRepo.findById.mockResolvedValue(existing)
    await expect(service.update(2, { status: "active" })).rejects.toThrow(ConflictException)
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it("update status error -> active throws ConflictException", async () => {
    const existing: Stream = { id: 3, userId: 1, name: "s", description: null, status: "error", createdAt: new Date(), updatedAt: new Date() }
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
})
