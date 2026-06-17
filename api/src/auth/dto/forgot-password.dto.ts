import { IsEmail } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

/** Payload accepted by `POST /auth/forgot-password`. */
export class ForgotPasswordDto {
  @ApiProperty({
    description: "Registered email address for account recovery.",
    example: "user@example.com",
  })
  @IsEmail()
  email!: string
}
