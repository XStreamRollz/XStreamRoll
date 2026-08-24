import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common"
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"
import { AuthResponse, AuthService } from "./auth.service"
import { LoginDto } from "./dto/login.dto"
import { RegisterDto } from "./dto/register.dto"

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

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Refresh an expired access token",
    description:
      "Accepts a refresh token via the request body (`refreshToken`) or via " +
      "the `refresh_token` httpOnly cookie. Returns a fresh access token, " +
      "refresh token, and the user profile.",
  })
  @ApiOkResponse({
    description: "Token refresh successful. New token pair returned.",
  })
  refresh(
    @Body("refreshToken") bodyToken?: string,
    @Req() req?: { cookies?: Record<string, string> },
  ): Promise<AuthResponse> {
    const token = bodyToken ?? req?.cookies?.refresh_token
    if (!token) {
      throw new UnauthorizedException("refresh token is required")
    }
    return this.authService.refresh(token)
  }
}
