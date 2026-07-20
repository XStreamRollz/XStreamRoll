import { IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator"
import {
  IsOptionalStreamVisibility,
  type StreamVisibility,
} from "./visibility"

/**
 * Payload accepted by `PATCH /streams/:id`. All fields are optional;
 * only the supplied fields are updated.
 *
 * `visibility` is optional so an owner can flip a stream between
 * public and private at any time without touching the rest of the
 * record.
 */
export class UpdateStreamDto {
  @IsOptional()
  @IsString()
  @Length(1, 255, {
    message: "name must be between 1 and 255 characters",
  })
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000, {
    message: "description must be at most 2000 characters",
  })
  description?: string

  @IsOptional()
  @IsString()
  @IsIn(["inactive", "active", "error"], {
    message: "status must be one of: inactive, active, error",
  })
  status?: string

  @IsOptionalStreamVisibility()
  visibility?: StreamVisibility
}
