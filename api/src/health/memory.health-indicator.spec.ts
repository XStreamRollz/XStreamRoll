import { HealthCheckError } from "@nestjs/terminus"
import { MemoryHealthIndicator } from "./memory.health-indicator"

describe("MemoryHealthIndicator", () => {
  let indicator: MemoryHealthIndicator

  beforeEach(() => {
    indicator = new MemoryHealthIndicator()
    jest.restoreAllMocks()
  })

  describe("checkHeap", () => {
    it("reports up when heap usage is within the threshold", async () => {
      jest.spyOn(process, "memoryUsage").mockReturnValue({
        heapUsed: 100 * 1024 * 1024,
        heapTotal: 256 * 1024 * 1024,
        external: 0,
        rss: 150 * 1024 * 1024,
        arrayBuffers: 0,
      })

      const result = await indicator.checkHeap("memory_heap")

      expect(result["memory_heap"].status).toBe("up")
      expect(result["memory_heap"].heapUsed).toBeDefined()
    })

    it("throws HealthCheckError when heap exceeds the 512 MiB threshold", async () => {
      jest.spyOn(process, "memoryUsage").mockReturnValue({
        heapUsed: 600 * 1024 * 1024,
        heapTotal: 700 * 1024 * 1024,
        external: 0,
        rss: 700 * 1024 * 1024,
        arrayBuffers: 0,
      })

      await expect(indicator.checkHeap("memory_heap")).rejects.toBeInstanceOf(HealthCheckError)
    })
  })

  describe("checkEventLoopLag", () => {
    it("reports up when event loop lag is within the threshold", async () => {
      const result = await indicator.checkEventLoopLag("event_loop")

      expect(result["event_loop"].status).toBe("up")
      expect(typeof result["event_loop"].lagMs).toBe("number")
    })

    it("throws HealthCheckError when simulated lag exceeds 100 ms", async () => {
      // Force a lag reading above the threshold by mocking hrtime.
      let callCount = 0
      jest.spyOn(process.hrtime, "bigint").mockImplementation(() => {
        // First call (start): 0ns; second call (after setImmediate): 200ms in ns
        return callCount++ === 0 ? BigInt(0) : BigInt(200_000_000)
      })

      await expect(indicator.checkEventLoopLag("event_loop")).rejects.toBeInstanceOf(
        HealthCheckError,
      )
    })
  })
})
