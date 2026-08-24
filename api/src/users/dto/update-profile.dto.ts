import { IsEmail, IsOptional, IsString, Length, Matches } from "class-validator"
import { ApiPropertyOptional } from "@nestjs/swagger"

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: "New username (3–30 characters, alphanumeric + underscores).",
    example: "new_streamer42",
  })
  @IsOptional()
  @IsString()
  @Length(3, 30)
  @Matches(/^[A-Za-z0-9_]+$/, {
    message: "username may only contain letters, digits, and underscores",
  })
  username?: string

  @ApiPropertyOptional({
    description: "New email address.",
    example: "new@example.com",
  })
  @IsOptional()
  @IsEmail()
  email?: string
}
