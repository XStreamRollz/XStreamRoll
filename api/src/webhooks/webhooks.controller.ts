import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger"
import type { Request } from "express"
import { AuthGuard } from "../common/guards/auth.guard"
import { StreamOwnershipService } from "../common/guards/stream-ownership.service"
import { CreateWebhookDto } from "./dto/create-webhook.dto"
import { ListDeliveriesQueryDto } from "./dto/list-deliveries.query.dto"
import { WebhooksService } from "./webhooks.service"

type AuthedRequest = Request & { auth?: { userId: number } }

/**
 * Webhook subscription registration and delivery log.
 *
 *   POST /webhooks                   Register a webhook (auth required, must own the stream)
 *   GET  /webhooks/:id/deliveries    Delivery log for a webhook (auth required, must own the webhook)
 */
@ApiTags("webhooks")
@Controller("webhooks")
@UseGuards(AuthGuard)
@ApiBearerAuth("bearer")
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly streamOwnership: StreamOwnershipService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Register a webhook",
    description:
      "Subscribes a URL to stream lifecycle events. Requires ownership of the stream. " +
      "The response includes the signing secret — it is only ever returned here, at creation time.",
  })
  @ApiCreatedResponse({ description: "Webhook registered." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  @ApiForbiddenResponse({ description: "You do not own this stream." })
  async create(
    @Body() body: CreateWebhookDto,
    @Req() req: AuthedRequest,
  ) {
    const userId = req.auth!.userId
    const owns = await this.streamOwnership.ownsStream(userId, body.streamId)
    if (!owns) {
      throw new ForbiddenException(
        `user ${userId} does not own stream ${body.streamId}`,
      )
    }

    return this.webhooksService.register({
      userId,
      streamId: body.streamId,
      url: body.url,
      events: body.events,
    })
  }

  @Get(":id/deliveries")
  @ApiOperation({
    summary: "List webhook deliveries",
    description:
      "Returns a paginated delivery log (status codes, response bodies, retry state) for a webhook. Requires ownership.",
  })
  @ApiOkResponse({ description: "Paginated list of deliveries." })
  @ApiNotFoundResponse({ description: "Webhook not found." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  @ApiForbiddenResponse({ description: "You do not own this webhook." })
  async listDeliveries(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: ListDeliveriesQueryDto,
    @Req() req: AuthedRequest,
  ) {
    const subscription = await this.webhooksService.findById(id)
    if (subscription.userId !== req.auth!.userId) {
      throw new ForbiddenException(
        `user ${req.auth!.userId} does not own webhook ${id}`,
      )
    }

    const page = query.page ?? 1
    const limit = query.limit ?? 20
    return this.webhooksService.listDeliveries(id, page, limit)
  }
}
