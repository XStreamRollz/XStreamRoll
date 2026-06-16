import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsOptional, IsString } from "class-validator"
import { PaginationQueryDto } from "../../common/dto/pagination.dto"

/**
 * Query parameters for `GET /streams`.
 *
 * Extends the shared {@link PaginationQueryDto} so paging behaviour is
 * consistent with the rest of the API. Adds an optional `status` filter.
 */
export class ListStreamsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: "Filter streams by status (inactive, active, error)",
    example: "active",
  })
  @IsOptional()
  @IsString()
  @IsIn(["inactive", "active", "error"], {
    message: "status must be one of: inactive, active, error",
  })
  status?: string
}
