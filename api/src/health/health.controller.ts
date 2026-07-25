import { Controller, Get, ServiceUnavailableException } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger"
import { HealthCheckService } from "@nestjs/terminus"
import { SkipThrottle } from "@nestjs/throttler"
import { DatabaseHealthIndicator } from "./database.health-indicator"
import { MemoryHealthIndicator } from "./memory.health-indicator"

export class HealthCheckResponseDto {
  @ApiProperty({
    description: "Service health status.",
    enum: ["ok"],
    example: "ok",
  })
  status!: "ok"

  @ApiProperty({
    description: "ISO-8601 timestamp at which the check was produced.",
    example: "2026-05-15T12:34:56.789Z",
  })
  timestamp!: string
}

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly databaseHealthIndicator: DatabaseHealthIndicator,
    private readonly memoryHealthIndicator: MemoryHealthIndicator,
  ) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({
    summary: "Readiness probe",
    description:
      "Verifies the database connection, heap memory usage, and event loop lag. " +
      "Returns 503 if any dependency is unhealthy so Kubernetes can route " +
      "traffic away from this pod without restarting it.",
  })
  @ApiOkResponse({ type: HealthCheckResponseDto })
  async check(): Promise<HealthCheckResponseDto> {
    try {
      await this.healthCheckService.check([
        async () => this.databaseHealthIndicator.isHealthy("database"),
        async () => this.memoryHealthIndicator.checkHeap("memory_heap"),
        async () => this.memoryHealthIndicator.checkEventLoopLag("event_loop"),
      ])
      return { status: "ok", timestamp: new Date().toISOString() }
    } catch {
      throw new ServiceUnavailableException("Service health check failed.")
    }
  }

  /**
   * Pure liveness probe — no dependency checks. A transient DB outage or
   * memory spike must not trigger a pod restart loop; only use this path for
   * the Kubernetes livenessProbe. Use GET /health for the readinessProbe.
   *
   * Registered under both /health/live (canonical) and /health/livez (K8s
   * convention alias) so either path can be used in manifests.
   */
  @Get("live")
  @Get("livez")
  @SkipThrottle()
  @ApiOperation({
    summary: "Liveness probe",
    description:
      "Returns a fixed `ok` status and the current server timestamp. " +
      "Does not check any external dependency — safe to use as a Kubernetes " +
      "liveness probe so a DB outage cannot cause an unwanted pod restart.",
  })
  @ApiOkResponse({ type: HealthCheckResponseDto })
  checkLiveness(): HealthCheckResponseDto {
    return { status: "ok", timestamp: new Date().toISOString() }
  }
}
