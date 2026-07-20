import { Test, TestingModule } from "@nestjs/testing"

import { StreamOwnershipGuard } from "../common/guards/stream-ownership.guard"
import { Tag } from "./tag.entity"
import { StreamTagsController, TagsListController } from "./tags.controller"
import { TagsService } from "./tags.service"

// Mock the env config before any imports that transitively load it.
// StreamOwnershipGuard → StreamOwnershipService → config/env → validateEnv()
// which calls process.exit(1) when DATABASE_URL / STREAM_API_KEY are absent.
jest.mock("../config/env", () => ({
  env: {
    PORT: "3001",
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost/test",
    JWT_SECRET: "test-secret",
    STREAM_API_KEY: "test-key",
  },
}))

const makeTag = (overrides: Partial<Tag> = {}): Tag => ({
  id: 1,
  name: "Live Streaming",
  slug: "live-streaming",
  createdAt: new Date(),
  ...overrides,
})

describe("TagsListController", () => {
  let controller: TagsListController
  let tagsService: jest.Mocked<Pick<TagsService, "list">>

  beforeEach(async () => {
    tagsService = { list: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagsListController],
      providers: [{ provide: TagsService, useValue: tagsService }],
    }).compile()

    controller = module.get(TagsListController)
  })

  it("calls tagsService.list with defaults when no query is provided", async () => {
    tagsService.list.mockResolvedValue({
      data: [],
      page: 1,
      limit: 20,
      total: 0,
      hasMore: false,
    })

    await controller.list({})

    expect(tagsService.list).toHaveBeenCalledWith(1, 20)
  })

  it("forwards explicit page and limit from query", async () => {
    tagsService.list.mockResolvedValue({
      data: [],
      page: 2,
      limit: 10,
      total: 0,
      hasMore: false,
    })

    await controller.list({ page: 2, limit: 10 })

    expect(tagsService.list).toHaveBeenCalledWith(2, 10)
  })

  it("returns whatever tagsService.list returns", async () => {
    const tag = makeTag()
    const payload = {
      data: [tag],
      page: 1,
      limit: 20,
      total: 1,
      hasMore: false,
    }
    tagsService.list.mockResolvedValue(payload)

    const result = await controller.list({})

    expect(result).toEqual(payload)
  })
})

describe("StreamTagsController", () => {
  let controller: StreamTagsController
  let tagsService: jest.Mocked<
    Pick<TagsService, "attachToStream" | "detachFromStream">
  >

  beforeEach(async () => {
    tagsService = {
      attachToStream: jest.fn(),
      detachFromStream: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StreamTagsController],
      providers: [{ provide: TagsService, useValue: tagsService }],
    })
      .overrideGuard(StreamOwnershipGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get(StreamTagsController)
  })

  // ── @UseGuards reflection ─────────────────────────────────────────────

  it("has StreamOwnershipGuard applied to the controller class", () => {
    const guards: unknown[] =
      Reflect.getMetadata("__guards__", StreamTagsController) ?? []
    expect(guards).toContain(StreamOwnershipGuard)
  })

  // ── attach ─────────────────────────────────────────────────────────────

  it("delegates attach to tagsService.attachToStream", async () => {
    const tag = makeTag()
    tagsService.attachToStream.mockResolvedValue(tag)

    const result = await controller.attach(1, { name: "Live Streaming" })

    expect(tagsService.attachToStream).toHaveBeenCalledWith(1, "Live Streaming")
    expect(result).toEqual(tag)
  })

  // ── detach ─────────────────────────────────────────────────────────────

  it("delegates detach to tagsService.detachFromStream", async () => {
    tagsService.detachFromStream.mockResolvedValue(undefined)

    await controller.detach(1, 7)

    expect(tagsService.detachFromStream).toHaveBeenCalledWith(1, 7)
  })

  it("resolves void on successful detach", async () => {
    tagsService.detachFromStream.mockResolvedValue(undefined)
    await expect(controller.detach(1, 7)).resolves.toBeUndefined()
  })
})
