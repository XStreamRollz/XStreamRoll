import { Test, TestingModule } from "@nestjs/testing"
import { MetricsService } from "./metrics.service"

describe("MetricsService", () => {
  let service: MetricsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile()

    service = module.get<MetricsService>(MetricsService)
    // Initialise default metrics (normally called by NestJS lifecycle)
    service.onModuleInit()
  })

  afterEach(() => {
    // Clear the registry between tests to avoid duplicate-metric errors
    service.registry.clear()
  })

  it("returns prometheus text format from getMetrics()", async () => {
    const output = await service.getMetrics()
    expect(typeof output).toBe("string")
    // prom-client text format always starts with "# HELP" lines
    expect(output).toMatch(/# HELP/)
  })

  it("contentType is text/plain with version", () => {
    expect(service.contentType).toContain("text/plain")
  })

  it("increments httpRequestsTotal counter", async () => {
    service.httpRequestsTotal.inc({ method: "GET", path: "/health", status_code: "200" })
    const output = await service.getMetrics()
    expect(output).toContain("http_requests_total")
    expect(output).toMatch(/http_requests_total\{[^}]+\} 1/)
  })

  it("observes httpRequestDurationSeconds histogram", async () => {
    service.httpRequestDurationSeconds.observe(
      { method: "GET", path: "/health", status_code: "200" },
      0.05,
    )
    const output = await service.getMetrics()
    expect(output).toContain("http_request_duration_seconds")
    expect(output).toContain("http_request_duration_seconds_sum")
  })

  it("increments and decrements websocket gauges correctly", async () => {
    service.websocketConnectionsTotal.inc()
    service.websocketActiveConnections.inc()
    service.websocketActiveConnections.dec()

    const output = await service.getMetrics()
    expect(output).toContain("websocket_connections_total")
    expect(output).toContain("websocket_active_connections")
    expect(output).toMatch(/websocket_connections_total \d/)
  })

  it("includes default Node.js process metrics", async () => {
    const output = await service.getMetrics()
    // Default metrics collected by collectDefaultMetrics
    expect(output).toContain("process_")
  })
})
