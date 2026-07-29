import { ApiPropertyOptional } from "@nestjs/swagger"
import { Transform } from "class-transformer"
import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator"
import { PaginationQueryDto } from "../../common/dto/pagination.dto"
import {
  STREAM_VISIBILITY_VALUES,
  type StreamVisibility,
} from "./visibility"

/**
 * Query parameters for `GET /streams`.
 *
 * Visibility rules (issue #393):
 *   - The base set returned to ANY authenticated caller is
 *     `(streams where visibility = 'public') UNION (streams owned by
 *     the caller)`. The DAO applies this filter so non-owners only
 *     see public streams, while owners always see their private ones.
 *   - `visibility` narrows the base set further ("public" or
 *     "private"). Owners asking for "private" still only see their
 *     own private streams — there is no way for one user to discover
 *     another user's private streams.
 *   - `ownerOnly=true` returns only the caller's own streams,
 *     regardless of their visibility. Useful for a "my streams" tab
 *     in the UI.
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

  @ApiPropertyOptional({
    description:
      "Narrow visibility within streams the caller can already access. 'public' shows public streams (plus the caller's own public ones); 'private' shows only streams owned by the caller that are private.",
    enum: STREAM_VISIBILITY_VALUES,
    example: "public",
  })
  @IsOptional()
  @IsString()
  @IsIn(STREAM_VISIBILITY_VALUES as unknown as string[], {
    message: "visibility must be one of: public, private",
  })
  visibility?: StreamVisibility

  @ApiPropertyOptional({
    description:
      "Return only streams owned by the caller, regardless of visibility. Useful for a 'my streams' tab.",
    type: Boolean,
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") return undefined
    if (typeof value === "boolean") return value
    if (typeof value === "string") {
      const lower = value.toLowerCase()
      if (lower === "true" || lower === "1") return true
      if (lower === "false" || lower === "0") return false
    }
    return value
  })
  @IsBoolean({ message: "ownerOnly must be a boolean" })
  ownerOnly?: boolean
}
