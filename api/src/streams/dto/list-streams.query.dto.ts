import { ApiPropertyOptional } from "@nestjs/swagger"
import { Transform } from "class-transformer"
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from "class-validator"

import {
  STREAM_VISIBILITY_VALUES,
  type StreamVisibility,
} from "./visibility"
import { PaginationQueryDto } from "../../common/dto/pagination.dto"

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

  @ApiPropertyOptional({
    description:
      "Case-insensitive substring search over stream name and description. '%' and '_' are matched literally, never as wildcards.",
    example: "football",
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ""
      ? undefined
      : typeof value === "string"
        ? value.trim()
        : value,
  )
  @IsString({ message: "q must be a string" })
  @MaxLength(200, { message: "q must be at most 200 characters" })
  q?: string

  @ApiPropertyOptional({
    description:
      "Restrict results to streams carrying this tag. Accepts a tag slug (e.g. 'live') or a numeric tag id. Unknown tags return an empty page.",
    example: "live",
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ""
      ? undefined
      : typeof value === "string"
        ? value.trim()
        : value,
  )
  @IsString({ message: "tag must be a string" })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "tag must be a slug (lowercase alphanumeric with hyphens) or a numeric id",
  })
  tag?: string
}
