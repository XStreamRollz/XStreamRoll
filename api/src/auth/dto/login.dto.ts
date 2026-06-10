import { IsEmail, IsString, Length } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

/**
 * Payload accepted by `POST /auth/login`.
 */
export class LoginDto {
  @ApiProperty({
    description: "Registered email address.",
    example: "user@example.com",
  })
  @IsEmail()
  email!: string

  @ApiProperty({
    description: "Account password.",
    example: "P4ssw0rd!",
  })
  @IsString()
  @Length(8, 128)
  password!: string
}
