import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger"

import { CreateWebhookDto } from "./dto/create-webhook.dto"
import { ListDeliveriesQueryDto } from "./dto/list-deliveries.query.dto"
import { ListWebhooksQueryDto } from "./dto/list-webhooks.query.dto"
import { UpdateWebhookDto } from "./dto/update-webhook.dto"
import { WebhookSubscription } from "./webhook-subscription.entity"
import { WebhooksService } from "./webhooks.service"
import { AuthGuard } from "../common/guards/auth.guard"
import { StreamOwnershipService } from "../common/guards/stream-ownership.service"

import type { Request } from "express"

type AuthedRequest = Request & { auth?: { userId: number } }

/** Wire shape of a subscription on every endpoint except creation. */
type WebhookSubscriptionResponse = Omit<WebhookSubscription, "secret">

/**
 * Webhook subscription registration, lifecycle management, and delivery
 * log.
 *
 *   POST   /webhooks                                Register a webhook (auth required, must own the stream)
 *   GET    /webhooks                                List the caller's subscriptions (auth required, paginated)
 *   PATCH  /webhooks/:id                            Update URL, events, or active flag (auth required, must own the webhook)
 *   DELETE /webhooks/:id                            Delete a subscription and its delivery history (auth required, must own the webhook)
 *   GET    /webhooks/:id/deliveries                 Delivery log for a webhook (auth required, must own the webhook)
 *   POST   /webhooks/:id/deliveries/:deliveryId/retry   Manually re-queue a failed/pending delivery (auth required, must own the webhook)
 *
 * ## `active` flag semantics
 *
 * Deactivating a subscription (`PATCH /webhooks/:id` with `active:
 * false`) stops new fan-out immediately — `dispatchStreamEvent` only
 * fans out to subscriptions matching `active = true` — and the retry
 * sweep skips its pending deliveries while it stays inactive. Those
 * pending deliveries are **left pending**, not cancelled: reactivating
 * the subscription resumes their retry schedule unchanged. Deleting the
 * subscription removes its deliveries entirely (ON DELETE CASCADE).
 *
 * ## Secret handling
 *
 * The signing secret is returned exactly once, in the `POST /webhooks`
 * creation response. Every other endpoint (`GET /webhooks`,
 * `PATCH /webhooks/:id`) omits it, and there is no endpoint that can
 * change it — correcting a leaked secret means deleting the
 * subscription and registering a new one.
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

  @Get()
  @ApiOperation({
    summary: "List webhook subscriptions",
    description:
      "Returns a paginated list of the caller's webhook subscriptions, " +
      "newest first. Optionally narrows to a single stream via `streamId`. " +
      "The signing secret is not included — it is creation-time-only.",
  })
  @ApiOkResponse({ description: "Paginated list of subscriptions." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  async list(
    @Query() query: ListWebhooksQueryDto,
    @Req() req: AuthedRequest,
  ) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const result = await this.webhooksService.listByUser(
      req.auth!.userId,
      page,
      limit,
      query.streamId,
    )
    return { ...result, data: result.data.map(toSubscriptionResponse) }
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update a webhook subscription",
    description:
      "Partially updates the URL, event list, and/or `active` flag of a " +
      "subscription. The signing secret cannot be changed — it is " +
      "creation-time-only. Requires ownership.",
  })
  @ApiOkResponse({ description: "Subscription updated." })
  @ApiNotFoundResponse({ description: "Webhook not found." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  @ApiForbiddenResponse({ description: "You do not own this webhook." })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateWebhookDto,
    @Req() req: AuthedRequest,
  ) {
    await this.assertOwnership(id, req.auth!.userId)
    if (
      body.url === undefined &&
      body.events === undefined &&
      body.active === undefined
    ) {
      throw new BadRequestException(
        "at least one of url, events, or active must be provided",
      )
    }

    const updated = await this.webhooksService.update(id, {
      url: body.url,
      events: body.events,
      active: body.active,
    })
    return toSubscriptionResponse(updated)
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a webhook subscription",
    description:
      "Deletes a subscription and, via the schema's ON DELETE CASCADE, its " +
      "entire delivery history. Requires ownership.",
  })
  @ApiNoContentResponse({ description: "Subscription deleted." })
  @ApiNotFoundResponse({ description: "Webhook not found." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  @ApiForbiddenResponse({ description: "You do not own this webhook." })
  async delete(
    @Param("id", ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ): Promise<void> {
    await this.assertOwnership(id, req.auth!.userId)
    await this.webhooksService.delete(id)
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
    await this.assertOwnership(id, req.auth!.userId)

    const page = query.page ?? 1
    const limit = query.limit ?? 20
    return this.webhooksService.listDeliveries(id, page, limit)
  }

  @Post(":id/deliveries/:deliveryId/retry")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Manually retry a webhook delivery",
    description:
      "Re-queues a failed or pending delivery so the retry sweep picks it up " +
      "immediately. The retry budget (`MAX_RETRIES`) still applies — the " +
      "attempt count is kept, not reset. Requires ownership of the webhook.",
  })
  @ApiOkResponse({ description: "Delivery re-queued." })
  @ApiNotFoundResponse({
    description: "Webhook or delivery not found (or delivery belongs to another webhook).",
  })
  @ApiConflictResponse({ description: "Delivery was already delivered." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  @ApiForbiddenResponse({ description: "You do not own this webhook." })
  async retryDelivery(
    @Param("id", ParseIntPipe) id: number,
    @Param("deliveryId", ParseIntPipe) deliveryId: number,
    @Req() req: AuthedRequest,
  ) {
    await this.assertOwnership(id, req.auth!.userId)
    return this.webhooksService.retryDelivery(id, deliveryId)
  }

  /** Loads the subscription and enforces that the caller owns it. */
  private async assertOwnership(id: number, userId: number): Promise<void> {
    const subscription = await this.webhooksService.findById(id)
    if (subscription.userId !== userId) {
      throw new ForbiddenException(`user ${userId} does not own webhook ${id}`)
    }
  }
}

/** Strips the signing secret for every non-creation response. */
function toSubscriptionResponse(
  subscription: WebhookSubscription,
): WebhookSubscriptionResponse {
  const { secret: _secret, ...rest } = subscription
  return rest
}
