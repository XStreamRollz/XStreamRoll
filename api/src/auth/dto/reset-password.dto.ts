import { IsString, Length, Matches } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

/** Payload accepted by `POST /auth/reset-password`. */
export class ResetPasswordDto {
  @ApiProperty({
    description: "Password reset token received in the email.",
    example: "4hB8r9v0Q2uLmT...",
  })
  @IsString()
  token!: string

  @ApiProperty({
    description:
      "New password (minimum 8 characters, at least one letter and one digit).",
    example: "NewP4ssw0rd!",
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
