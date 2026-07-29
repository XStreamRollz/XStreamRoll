import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger"
import type { Request } from "express"
import { AuthGuard } from "../common/guards/auth.guard"
import { ListNotificationsQueryDto } from "./dto/list-notifications.query.dto"
import { NotificationsService } from "./notifications.service"

type AuthedRequest = Request & { auth?: { userId: number } }

/**
 * Notification delivery for the authenticated user.
 *
 *   GET   /notifications           List unread notifications (paginated)
 *   PATCH /notifications/read-all  Mark all notifications as read
 *   PATCH /notifications/:id/read  Mark a single notification as read
 *   DELETE /notifications/:id      Delete a notification
 */
@ApiTags("notifications")
@Controller("notifications")
@UseGuards(AuthGuard)
@ApiBearerAuth("bearer")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: "List unread notifications",
    description:
      "Returns a paginated list of the authenticated user's unread notifications.",
  })
  @ApiOkResponse({ description: "Paginated list of unread notifications." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  list(@Query() query: ListNotificationsQueryDto, @Req() req: AuthedRequest) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    return this.notificationsService.listUnread(req.auth!.userId, page, limit)
  }

  @Patch("read-all")
  @ApiOperation({
    summary: "Mark all notifications as read",
    description: "Marks every unread notification for the user as read.",
  })
  @ApiOkResponse({ description: "Number of notifications updated." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  markAllRead(@Req() req: AuthedRequest) {
    return this.notificationsService.markAllRead(req.auth!.userId)
  }

  @Patch(":id/read")
  @ApiOperation({
    summary: "Mark a notification as read",
    description: "Marks a single notification as read. Requires ownership.",
  })
  @ApiOkResponse({ description: "Notification marked as read." })
  @ApiNotFoundResponse({ description: "Notification not found." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  markRead(
    @Param("id", ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.notificationsService.markRead(req.auth!.userId, id)
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a notification",
    description: "Deletes a notification. Requires ownership.",
  })
  @ApiNoContentResponse({ description: "Notification deleted." })
  @ApiNotFoundResponse({ description: "Notification not found." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  async delete(
    @Param("id", ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ): Promise<void> {
    await this.notificationsService.delete(req.auth!.userId, id)
  }
}
