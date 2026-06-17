import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common"
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"
import type { Request } from "express"
import { AuthResponse, AuthService } from "./auth.service"
import { LoginDto } from "./dto/login.dto"
import { RegisterDto } from "./dto/register.dto"
import { ForgotPasswordDto } from "./dto/forgot-password.dto"
import { ResetPasswordDto } from "./dto/reset-password.dto"

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Register a new user",
    description:
      "Creates a new user account. Email and username must be unique. " +
      "Returns a JWT access token and the user profile.",
  })
  @ApiCreatedResponse({
    description: "Registration successful. JWT token returned.",
  })
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto)
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Log in with email and password",
    description:
      "Authenticates a user by email and password. Returns a signed JWT access token.",
  })
  @ApiOkResponse({
    description: "Login successful. JWT token returned.",
  })
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto)
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Log out the current user",
    description: "Revokes the current access token so it cannot be used again.",
  })
  @ApiNoContentResponse({
    description: "Logout successful.",
  })
  logout(@Req() req: Request): Promise<void> {
    return this.authService.logout(req.header("authorization") ?? "")
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Request a password reset",
    description:
      "Accepts an email address and sends password reset instructions if the account exists. Always returns success to avoid email enumeration.",
  })
  @ApiOkResponse({
    description:
      "Password reset instructions will be sent if the email exists.",
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto)
    return {
      message:
        "If the email address exists, password reset instructions have been sent.",
    }
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reset a forgotten password",
    description:
      "Accepts a password reset token and a new password. Rejects invalid, expired, or already-used tokens.",
  })
  @ApiOkResponse({
    description: "Password reset successful.",
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(dto)
    return {
      message: "Password has been reset successfully.",
    }
  }
}
