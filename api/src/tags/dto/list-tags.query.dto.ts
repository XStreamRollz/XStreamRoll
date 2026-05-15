import { Type } from "class-transformer"
import { IsInt, IsOptional, Max, Min } from "class-validator"

/**
 * Query parameters for the public `GET /tags` endpoint.
 *
 * `page` is 1-indexed; `limit` is capped at 100 to keep payloads bounded.
 */
export class ListTagsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page must be an integer" })
  @Min(1, { message: "page must be >= 1" })
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "limit must be an integer" })
  @Min(1, { message: "limit must be >= 1" })
  @Max(100, { message: "limit must be <= 100" })
  limit?: number = 20
}
