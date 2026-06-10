import { IsEmail, IsString, Length, Matches } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

/**
 * Payload accepted by `POST /auth/register`.
 *
 * Validates that the payload contains a valid email, a username of
 * 3-30 characters, and a password meeting minimum complexity rules.
 */
export class RegisterDto {
  @ApiProperty({
    description: "Unique username (3–30 characters, alphanumeric + underscores).",
    example: "streamer42",
  })
  @IsString()
  @Length(3, 30)
  @Matches(/^[A-Za-z0-9_]+$/, {
    message: "username may only contain letters, digits, and underscores",
  })
  username!: string

  @ApiProperty({
    description: "Unique email address.",
    example: "user@example.com",
  })
  @IsEmail()
  email!: string

  @ApiProperty({
    description:
      "Password (minimum 8 characters, at least one letter and one digit).",
    example: "P4ssw0rd!",
  })
  @IsString()
  @Length(8, 128)
  @Matches(/[A-Za-z]/, {
    message: "password must contain at least one letter",
  })
  @Matches(/[0-9]/, {
    message: "password must contain at least one digit",
  })
  password!: string
}
