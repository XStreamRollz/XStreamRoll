import { IsEmail, IsString, MinLength } from "class-validator"

/**
 * Payload accepted by `POST /auth/register`.
 */
export class RegisterDto {
  @IsEmail({}, { message: "email must be a valid email address" })
  email!: string

  @IsString()
  @MinLength(8, { message: "password must be at least 8 characters" })
  password!: string
}
