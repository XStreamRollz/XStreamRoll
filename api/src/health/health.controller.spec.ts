import { ServiceUnavailableException } from "@nestjs/common"
import { HealthCheckService } from "@nestjs/terminus"
import { Test, TestingModule } from "@nestjs/testing"

import { DatabaseHealthIndicator } from "./database.health-indicator"
import { HealthController } from "./health.controller"
import { MemoryHealthIndicator } from "./memory.health-indicator"

const mockHealthCheckService = { check: jest.fn() }
const mockDatabaseHealthIndicator = { isHealthy: jest.fn() }
const mockMemoryHealthIndicator = {
  checkHeap: jest.fn(),
  checkEventLoopLag: jest.fn(),
}

describe("HealthController", () => {
  let controller: HealthController

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        {
          provide: DatabaseHealthIndicator,
          useValue: mockDatabaseHealthIndicator,
        },
        { provide: MemoryHealthIndicator, useValue: mockMemoryHealthIndicator },
      ],
    }).compile()

    controller = module.get<HealthController>(HealthController)
  })

  describe("checkLiveness — GET /health/live and GET /health/livez", () => {
    it("returns { status: ok } without invoking any health check", () => {
      const result = controller.checkLiveness()

      expect(result.status).toBe("ok")
      expect(result.timestamp).toBeDefined()
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp)
      expect(mockHealthCheckService.check).not.toHaveBeenCalled()
    })

    it("returns ok even when the database is unreachable", () => {
      // Simulate a broken DB indicator — liveness must not call it at all.
      mockDatabaseHealthIndicator.isHealthy.mockRejectedValue(
        new Error("DB down"),
      )

      const result = controller.checkLiveness()
      expect(result.status).toBe("ok")
    })
  })

  describe("check — GET /health (readiness probe)", () => {
    it("returns { status: ok } when all checks pass", async () => {
      mockHealthCheckService.check.mockResolvedValue({})

      const result = await controller.check()

      expect(result.status).toBe("ok")
      expect(result.timestamp).toBeDefined()
    })

    it("runs DB, memory heap, and event loop lag checks together", async () => {
      mockHealthCheckService.check.mockResolvedValue({})

      await controller.check()

      // Terminus receives an array of three indicator functions.
      const [checks] = mockHealthCheckService.check.mock.calls[0]
      expect(checks).toHaveLength(3)
    })

    it("throws ServiceUnavailableException when the DB check fails", async () => {
      mockHealthCheckService.check.mockRejectedValue(new Error("DB down"))

      await expect(controller.check()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      )
    })

    it("throws ServiceUnavailableException when the memory check fails", async () => {
      mockHealthCheckService.check.mockRejectedValue(
        new Error("Heap threshold exceeded"),
      )

      await expect(controller.check()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      )
    })

    it("throws ServiceUnavailableException when the event loop lag check fails", async () => {
      mockHealthCheckService.check.mockRejectedValue(
        new Error("Event loop lag too high"),
      )

      await expect(controller.check()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      )
    })
  })
})
