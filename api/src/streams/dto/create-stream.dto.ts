import { IsOptional, IsString, Length, MaxLength } from "class-validator"

/**
 * Payload accepted by `POST /streams`.
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
}
