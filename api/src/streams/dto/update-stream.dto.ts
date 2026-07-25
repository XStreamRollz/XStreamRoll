import { IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator"

/**
 * Payload accepted by `PATCH /streams/:id`. All fields are optional;
 * only the supplied fields are updated.
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
}
