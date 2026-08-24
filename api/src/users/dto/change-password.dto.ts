import { IsString, Length, Matches } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class ChangePasswordDto {
  @ApiProperty({
    description: "Current password.",
    example: "OldP4ssword",
  })
  @IsString()
  currentPassword!: string

  @ApiProperty({
    description:
      "New password (minimum 8 characters, at least one letter and one digit).",
    example: "NewP4ssword!",
  })
  @IsString()
  @Length(8, 128)
  @Matches(/[A-Za-z]/, {
    message: "password must contain at least one letter",
  })
  @Matches(/[0-9]/, {
    message: "password must contain at least one digit",
  })
  newPassword!: string
}
