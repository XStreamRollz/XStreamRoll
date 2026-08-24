import { ApiProperty } from "@nestjs/swagger"
import { IsOptional, IsString, Matches } from "class-validator"

/**
 * Payload accepted by `POST /streams/events` (issue #514).
 *
 * The server stamps the arrival timestamp itself — trusting client
 * clocks for latency metrics is a correctness risk, so the wire shape
 * deliberately has no timestamp field.
 */
export class IngestStreamEventDto {
  @ApiProperty({
    description: "Numeric stream id, as a string (matches the StreamEvent wire shape)",
    example: "42",
  })
  @IsString()
  @Matches(/^\d+$/, { message: "streamId must be a numeric string" })
  streamId!: string

  @ApiProperty({
    description: "Free-form event payload, persisted as JSONB in stream_data",
    example: { viewerId: "user_42" },
  })
  // Kept as a decorated (thus whitelist-preserved) optional field; the
  // service enforces presence + plain-object shape so the DTO stays
  // dependency-light (the installed class-validator d.ts lacks object decorators).
  @IsOptional()
  data?: Record<string, unknown>
}
