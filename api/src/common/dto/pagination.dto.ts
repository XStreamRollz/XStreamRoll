import { ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import { IsInt, IsOptional, Max, Min } from "class-validator"

export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: "Page number to return. 1-indexed.",
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page must be an integer" })
  @Min(1, { message: "page must be >= 1" })
  page?: number = 1

  @ApiPropertyOptional({
    description: "Number of items per page. Maximum 100.",
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "limit must be an integer" })
  @Min(1, { message: "limit must be >= 1" })
  @Max(100, { message: "limit must be <= 100" })
  limit?: number = 20
}

export interface PaginatedResult<T> {
  total: number
  page: number
  limit: number
  data: T[]
}
