import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"
import type { Request, Response } from "express"
import { AuthResponse, AuthService } from "./auth.service"
import { LoginDto } from "./dto/login.dto"
import { RegisterDto } from "./dto/register.dto"
import { ForgotPasswordDto } from "./dto/forgot-password.dto"
import { ResetPasswordDto } from "./dto/reset-password.dto"

const REFRESH_COOKIE_NAME = "refresh_token"
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @ApiOperation({
    summary: "Register a new user",
    description:
      "Creates a new user account. Email and username must be unique. " +
      "Returns a JWT access token, refresh token, and the user profile. " +
      "The refresh token is also set as an httpOnly cookie.",
  })
  @ApiCreatedResponse({
    description: "Registration successful. JWT tokens returned.",
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.register(dto, req)
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS)
    return result
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @ApiOperation({
    summary: "Log in with email and password",
    description:
      "Authenticates a user by email and password. Returns signed JWTs. " +
      "The refresh token is also set as an httpOnly cookie.",
  })
  @ApiOkResponse({
    description: "Login successful. JWT tokens returned.",
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(dto, req)
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS)
    return result
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Refresh the access token",
    description:
      "Reads the refresh token from the httpOnly cookie and returns a new access token.",
  })
  @ApiOkResponse({
    description: "Access token refreshed.",
  })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    const result = await this.authService.refresh(req)
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS)
    return result
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Log out the current user",
    description:
      "Revokes the current access token and refresh token so they cannot be used again. " +
      "Clears the refresh token cookie.",
  })
  @ApiNoContentResponse({
    description: "Logout successful.",
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken = req.cookies?.refresh_token
    res.clearCookie(REFRESH_COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: 0 })
    return this.authService.logout(
      req.header("authorization") ?? "",
      refreshToken,
    )
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
