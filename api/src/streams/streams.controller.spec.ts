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

  beforeEach(() => {
    mockService = {
      create: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }
    controller = new StreamsController(mockService)
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
