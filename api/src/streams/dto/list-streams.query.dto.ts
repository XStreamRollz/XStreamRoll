import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsOptional, IsString } from "class-validator"
import { PaginationQueryDto } from "../../common/dto/pagination.dto"

/**
 * Query parameters for `GET /streams`.
 *
 * Extends the shared {@link PaginationQueryDto} so paging behaviour is
 * consistent with the rest of the API. Adds optional status and
 * visibility filters (issue #393).
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

  /**
   * Filter by visibility (issue #393). The default is `"private"`
   * since owners listing their own streams almost always want the
   * whole set; public dashboards can request `visibility=public` to
   * discover streams shared with them.
   */
  @ApiPropertyOptional({
    description: "Filter streams by visibility (public, private)",
    example: "private",
  })
  @IsOptional()
  @IsString()
  @IsIn(["public", "private"], {
    message: "visibility must be one of: public, private",
  })
  visibility?: "public" | "private"
}
