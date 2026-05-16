import { Controller, Get } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger"

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
  @Get()
  @ApiOperation({
    summary: "Liveness probe",
    description:
      "Returns a fixed `ok` status and the current server timestamp. " +
      "Intended for use by load balancers and orchestrators.",
  })
  @ApiOkResponse({ type: HealthCheckResponseDto })
  check(): HealthCheckResponseDto {
    return { status: "ok", timestamp: new Date().toISOString() }
  }
}
