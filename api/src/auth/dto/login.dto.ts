import { IsEmail, IsString } from "class-validator"

/**
 * Payload accepted by `POST /auth/login`.
 */
export class LoginDto {
  @IsEmail({}, { message: "email must be a valid email address" })
  email!: string

  @IsString()
  password!: string
}
