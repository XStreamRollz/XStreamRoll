import { Transform } from "class-transformer"
import { IsOptional, IsString, Length, MaxLength } from "class-validator"
import {
  IsOptionalStreamVisibility,
  type StreamVisibility,
} from "./visibility"

const DEFAULT_VISIBILITY: StreamVisibility = "private"

/**
 * Payload accepted by `POST /streams`.
 *
 * `visibility` defaults to "private" so new adopters opt-in to public
 * listings explicitly — matching the conservative-by-default behaviour
 * enforced by the migration that backfilled existing rows with
 * 'private'.
 */
export class CreateStreamDto {
  @IsString()
  @Length(1, 255, {
    message: "name must be between 1 and 255 characters",
  })
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000, {
    message: "description must be at most 2000 characters",
  })
  description?: string

  @IsOptionalStreamVisibility()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ""
      ? DEFAULT_VISIBILITY
      : (value as StreamVisibility),
  )
  visibility?: StreamVisibility = DEFAULT_VISIBILITY
}
