import { ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import { IsInt, IsOptional, Min } from "class-validator"

import { PaginationQueryDto } from "../../common/dto/pagination.dto"

/**
 * Query parameters for `GET /webhooks`. Paging behaviour matches the
 * rest of the API (1-indexed page, limit capped at 100). `streamId`
 * narrows the result to the caller's subscriptions on one stream.
 */
export class ListWebhooksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      "Only return the caller's subscriptions on this stream.",
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "streamId must be an integer" })
  @Min(1, { message: "streamId must be >= 1" })
  streamId?: number
}
