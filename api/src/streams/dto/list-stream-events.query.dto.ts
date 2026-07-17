import { IsISO8601, IsInt, IsOptional, Max, Min } from "class-validator"
import { ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"

export class ListStreamEventsQueryDto {
  @ApiPropertyOptional({
    description:
      "Only return events after this ISO-8601 timestamp (inclusive).",
    example: "2026-07-16T12:00:00Z",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  since?: string

  @ApiPropertyOptional({
    description: "Maximum number of events to return (1–100).",
    example: 50,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @ApiPropertyOptional({
    description:
      "Cursor from the previous page (the last event id). " +
      "Returns events after this id.",
    example: "42",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number
}
