import { Controller, Get, ServiceUnavailableException } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger"
import { HealthCheckService } from "@nestjs/terminus"
import { SkipThrottle } from "@nestjs/throttler"
import { DatabaseHealthIndicator } from "./database.health-indicator"

export class HealthCheckResponseDto {
  @ApiProperty({
    description: "Service liveness status.",
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
  ) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({
    summary: "Readiness probe",
    description:
      "Returns a fixed `ok` status and the current server timestamp. " +
      "Also verifies the database connection — if the DB is unreachable " +
      "the probe returns `503` so Kubernetes can route traffic elsewhere.",
  })
  @ApiOkResponse({ type: HealthCheckResponseDto })
  async check(): Promise<HealthCheckResponseDto> {
    try {
      await this.healthCheckService.check([
        async () => this.databaseHealthIndicator.isHealthy("database"),
      ])
      return { status: "ok", timestamp: new Date().toISOString() }
    } catch (error) {
      throw new ServiceUnavailableException(
        "Database connectivity check failed.",
      )
    }
  }

  /**
   * Pure liveness probe — deliberately decoupled from the database so
   * that a transient DB outage cannot trigger a pod restart loop. Use
   * this for `livenessProbe` in the Deployment manifest; use `/health`
   * for `readinessProbe` instead.
   */
  @Get("livez")
  @SkipThrottle()
  @ApiOperation({
    summary: "Liveness probe (no DB check)",
    description:
      "Returns a fixed `ok` status and the current server timestamp. " +
      "Does not touch the database — safe to use as a Kubernetes " +
      "liveness probe.",
  })
  @ApiOkResponse({ type: HealthCheckResponseDto })
  checkLiveness(): HealthCheckResponseDto {
    return { status: "ok", timestamp: new Date().toISOString() }
  }
}
