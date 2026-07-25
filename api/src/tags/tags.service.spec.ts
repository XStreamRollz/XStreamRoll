import { BadRequestException, NotFoundException } from "@nestjs/common"
import { Test, TestingModule } from "@nestjs/testing"
import { TagsRepository } from "./repository/tags.repository"
import { Tag } from "./tag.entity"
import { TagsService } from "./tags.service"

const makeTag = (overrides: Partial<Tag> = {}): Tag => ({
  id: 1,
  name: "Live Streaming",
  slug: "live-streaming",
  createdAt: new Date(),
  ...overrides,
})

describe("TagsService", () => {
  let service: TagsService
  let repo: jest.Mocked<TagsRepository>

  beforeEach(async () => {
    const mockRepo: jest.Mocked<TagsRepository> = {
      listPaginated: jest.fn(),
      findBySlug: jest.fn(),
      findById: jest.fn(),
      upsertBySlug: jest.fn(),
      attachToStream: jest.fn(),
      detachFromStream: jest.fn(),
      isAttached: jest.fn(),
      listForStreamIds: jest.fn(),
    } as unknown as jest.Mocked<TagsRepository>

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: TagsRepository, useValue: mockRepo },
      ],
    }).compile()

    service = module.get(TagsService)
    repo = module.get(TagsRepository)
  })

  // ── list ────────────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns paginated data with hasMore=true when more pages exist", async () => {
      const tag = makeTag()
      repo.listPaginated.mockResolvedValue({ items: [tag], total: 25 })

      const result = await service.list(1, 20)

      expect(result.data).toEqual([tag])
      expect(result.total).toBe(25)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
      expect(result.hasMore).toBe(true)
    })

    it("returns hasMore=false on the last page", async () => {
      repo.listPaginated.mockResolvedValue({ items: [], total: 20 })
      const result = await service.list(1, 20)
      expect(result.hasMore).toBe(false)
    })

    it("delegates to TagsRepository.listPaginated with correct args", async () => {
      repo.listPaginated.mockResolvedValue({ items: [], total: 0 })
      await service.list(3, 10)
      expect(repo.listPaginated).toHaveBeenCalledWith(3, 10)
    })
  })

  // ── attachToStream ───────────────────────────────────────────────────────

  describe("attachToStream", () => {
    it("creates a new tag and attaches it to the stream", async () => {
      const tag = makeTag()
      repo.upsertBySlug.mockResolvedValue(tag)
      repo.attachToStream.mockResolvedValue({
        streamId: 1,
        tagId: tag.id,
        createdAt: new Date(),
      })

      const result = await service.attachToStream(1, "Live Streaming")

      expect(repo.upsertBySlug).toHaveBeenCalledWith("Live Streaming", "live-streaming")
      expect(repo.attachToStream).toHaveBeenCalledWith(1, tag.id)
      expect(result).toEqual(tag)
    })

    it("reuses an existing tag when the slug already exists", async () => {
      const existing = makeTag({ id: 42 })
      repo.upsertBySlug.mockResolvedValue(existing)
      repo.attachToStream.mockResolvedValue({
        streamId: 5,
        tagId: 42,
        createdAt: new Date(),
      })

      const result = await service.attachToStream(5, "Live Streaming")

      expect(repo.upsertBySlug).toHaveBeenCalledTimes(1)
      expect(result.id).toBe(42)
    })

    it("trims whitespace from name before slugifying", async () => {
      const tag = makeTag()
      repo.upsertBySlug.mockResolvedValue(tag)
      repo.attachToStream.mockResolvedValue({
        streamId: 1,
        tagId: tag.id,
        createdAt: new Date(),
      })

      await service.attachToStream(1, "  Live Streaming  ")

      expect(repo.upsertBySlug).toHaveBeenCalledWith("Live Streaming", "live-streaming")
    })

    it("throws BadRequestException for empty name", async () => {
      await expect(service.attachToStream(1, "")).rejects.toThrow(BadRequestException)
    })

    it("throws BadRequestException for non-alphanumeric name", async () => {
      await expect(service.attachToStream(1, "!!!")).rejects.toThrow(
        BadRequestException,
      )
    })

    it("throws BadRequestException with descriptive message", async () => {
      await expect(service.attachToStream(1, "---")).rejects.toThrow(
        "name must contain at least one alphanumeric character",
      )
    })
  })

  // ── listForStreamIds (issue #330) ───────────────────────────────────────

  describe("listForStreamIds", () => {
    it("delegates straight through to the repository and returns its Map", async () => {
      const map = new Map<number, Tag[]>([[1, [makeTag()]]])
      repo.listForStreamIds.mockResolvedValue(map)

      const res = await service.listForStreamIds([1, 2, 3])

      expect(repo.listForStreamIds).toHaveBeenCalledWith([1, 2, 3])
      expect(res).toBe(map)
    })

    it("returns an empty Map when no stream ids are requested (short-circuit)", async () => {
      const res = await service.listForStreamIds([])
      expect(res.size).toBe(0)
      // The repository should NOT be called for the empty case so a
      // DB-backed implementation can short-circuit out of the
      // `WHERE stream_id = ANY($1)` query. We assert the mock is
      // untouched to lock this contract in.
      expect(repo.listForStreamIds).not.toHaveBeenCalled()
    })
  })

  // ── detachFromStream ─────────────────────────────────────────────────────

  describe("detachFromStream", () => {
    it("detaches a tag that is currently attached to the stream", async () => {
      const tag = makeTag({ id: 7 })
      repo.findById.mockResolvedValue(tag)
      repo.detachFromStream.mockResolvedValue(true)

      await expect(service.detachFromStream(1, 7)).resolves.toBeUndefined()
      expect(repo.detachFromStream).toHaveBeenCalledWith(1, 7)
    })

    it("throws NotFoundException when the tag does not exist", async () => {
      repo.findById.mockResolvedValue(undefined)

      await expect(service.detachFromStream(1, 99)).rejects.toThrow(NotFoundException)
      await expect(service.detachFromStream(1, 99)).rejects.toThrow("tag 99 not found")
    })

    it("throws NotFoundException when tag is not attached to the stream", async () => {
      const tag = makeTag({ id: 7 })
      repo.findById.mockResolvedValue(tag)
      repo.detachFromStream.mockResolvedValue(false)

      await expect(service.detachFromStream(1, 7)).rejects.toThrow(NotFoundException)
      await expect(service.detachFromStream(1, 7)).rejects.toThrow(
        "tag 7 is not attached to stream 1",
      )
    })
  })
})
