import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"
import type { Request } from "express"
import { AuthGuard } from "../common/guards/auth.guard"
import { ChangePasswordDto } from "./dto/change-password.dto"
import { UpdateProfileDto } from "./dto/update-profile.dto"
import { ProfileResponse, UsersService } from "./users.service"

@ApiTags("users")
@UseGuards(AuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get current user profile",
    description: "Returns the authenticated user's profile information.",
  })
  @ApiOkResponse({
    description: "User profile returned successfully.",
  })
  getProfile(@Req() req: Request) {
    const { userId } = (req as Request & { auth: { userId: number } }).auth
    return this.usersService.getProfile(userId)
  }

  @Patch("me")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: "Update user profile",
    description:
      "Updates the authenticated user's username and/or email. " +
      "When the email changes, the current token is revoked and a new one is issued.",
  })
  @ApiOkResponse({
    description: "Profile updated successfully.",
  })
  updateProfile(
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ): Promise<ProfileResponse> {
    const { userId } = (req as Request & { auth: { userId: number } }).auth
    return this.usersService.updateProfile(
      userId,
      dto,
      req.header("authorization") ?? "",
    )
  }

  @Post("me/change-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    summary: "Change password",
    description:
      "Changes the authenticated user's password. Requires the current password. " +
      "Returns a new access token.",
  })
  @ApiOkResponse({
    description: "Password changed successfully.",
  })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<ProfileResponse> {
    const { userId } = (req as Request & { auth: { userId: number } }).auth
    return this.usersService.changePassword(
      userId,
      dto,
      req.header("authorization") ?? "",
    )
  }
}
