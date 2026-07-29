import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common"
import { CACHE_MANAGER } from "@nestjs/cache-manager"
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger"
import type { PaginatedResponse, Stream } from "@xstreamroll/types"
import type { Request } from "express"
import { Cache } from "cache-manager"
import { AuthGuard } from "../common/guards/auth.guard"
import { StreamOwnershipGuard } from "../common/guards/stream-ownership.guard"
import { CreateStreamDto } from "./dto/create-stream.dto"
import { ListStreamsQueryDto } from "./dto/list-streams.query.dto"
import { StreamAnalyticsDto } from "./dto/stream-analytics.dto"
import { toStreamResponse } from "./dto/stream-response.dto"
import { UpdateStreamDto } from "./dto/update-stream.dto"
import { StreamsService } from "./streams.service"

const STREAM_ANALYTICS_CACHE_TTL_MS = 60_000

/**
 * Full CRUD for streams.
 *
 *   POST   /streams          Create a new stream (auth required)
 *   GET    /streams          List streams (auth required, paginated)
 *   GET    /streams/:id      Get a single stream (ownership required)
 *   PATCH  /streams/:id      Update stream details (ownership required)
 *   DELETE /streams/:id      Delete a stream (ownership required)
 */
@ApiTags("streams")
@Controller("streams")
export class StreamsController {
  constructor(
    private readonly streamsService: StreamsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Paginated list of pending (unprocessed) stream events for the
   * processing worker.
   *
   * The worker fetches batches by advancing `cursor` until `nextCursor`
   * is `null`, which signals that there are no more events to process.
   *
   * This endpoint is intentionally unauthenticated so the worker can
   * poll without managing JWT tokens. In production this route should
   * be firewalled to the internal service network.
   */
  @Get("pending")
  @ApiOperation({
    summary: "List pending stream events (paginated)",
    description:
      "Returns a paginated batch of unprocessed stream events. " +
      "Intended for internal use by the processing worker only. " +
      "Advance `cursor` by the returned `nextCursor` value until it is null.",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Batch size (default 100, max 1000)",
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    type: Number,
    description: "Offset cursor (default 0)",
  })
  @ApiOkResponse({ description: "Paginated list of pending stream events." })
  async getPending(
    @Query("limit") limitStr?: string,
    @Query("cursor") cursorStr?: string,
  ) {
    const limit = Math.min(Math.max(1, Number(limitStr ?? 100)), 1000)
    const offset = Math.max(0, Number(cursorStr ?? 0))
    return this.streamsService.getPendingEvents(limit, offset)
  }

  /**
   * Create a new stream. The authenticated user becomes the owner.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Create a new stream",
    description:
      "Creates a new stream with the authenticated user as owner. " +
      "Visibility defaults to \"private\" (issue #393).",
  })
  @ApiCreatedResponse({ description: "Stream created successfully." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  async create(
    @Body() body: CreateStreamDto,
    @Req() req: Request & { auth?: { userId: number } },
  ): Promise<Stream> {
    const stream = await this.streamsService.create({
      userId: req.auth!.userId,
      name: body.name,
      description: body.description,
      visibility: body.visibility,
    })
    return toStreamResponse(stream)
  }

  /**
   * List all streams with optional status and visibility filters and pagination.
   */
  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "List streams",
    description:
      "Returns a paginated list of streams with optional status and " +
      "visibility filters (issue #393).",
  })
  @ApiOkResponse({ description: "Paginated list of streams." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  async list(
    @Query() query: ListStreamsQueryDto,
  ): Promise<PaginatedResponse<Stream> & { hasMore: boolean }> {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const paged = await this.streamsService.list(page, limit, {
      status: query.status,
      visibility: query.visibility,
    })
    return { ...paged, data: paged.data.map(toStreamResponse) }
  }

  /**
   * Get aggregate analytics for a stream. Requires stream ownership.
   */
  @Get(":id/analytics")
  @UseGuards(StreamOwnershipGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Get stream analytics",
    description:
      "Returns cached aggregate event counts, error rate, processing latency, and per-minute volume for a stream. Requires ownership.",
  })
  @ApiOkResponse({
    description: "Stream analytics found.",
    type: StreamAnalyticsDto,
  })
  @ApiNotFoundResponse({ description: "Stream not found." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  @ApiForbiddenResponse({ description: "You do not own this stream." })
  async getAnalytics(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<StreamAnalyticsDto> {
    const cacheKey = `streams:${id}:analytics`
    const cached = await this.cache.get<StreamAnalyticsDto>(cacheKey)
    if (cached) return cached

    const analytics = await this.streamsService.getAnalytics(id)
    await this.cache.set(cacheKey, analytics, STREAM_ANALYTICS_CACHE_TTL_MS)
    return analytics
  }

  /**
   * Replay the historical event log for a stream (issue #396).
   * Returns the most recent events newest-first, paginated like every
   * other list endpoint. Owner-only via {@link StreamOwnershipGuard}.
   */
  @Get(":id/events")
  @UseGuards(StreamOwnershipGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Replay stream events",
    description:
      "Returns a paginated list of historical events recorded for a stream, " +
      "newest-first. Useful for catch-up after a worker restart, audit tooling, " +
      "and any time the live WebSocket fan-out missed a window. Requires ownership.",
  })
  @ApiOkResponse({ description: "Paginated event log." })
  @ApiNotFoundResponse({ description: "Stream not found." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  @ApiForbiddenResponse({ description: "You do not own this stream." })
  async listEvents(
    @Param("id", ParseIntPipe) id: number,
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 50,
  ): Promise<{
    data: Array<{
      id: string
      streamId: string
      eventType: string
      payload: Record<string, unknown>
      occurredAt: string
    }>
    page: number
    limit: number
    total: number
    hasMore: boolean
  }> {
    const paged = await this.streamsService.listEvents(id, page, limit)
    // The repository already builds records with `streamId` as a
    // stringified id (see {@link StreamsRepository.listEventsForStream}).
    // Returning the paginated envelope unchanged avoids re-casting a
    // value that's already in the canonical wire shape.
    return paged
  }

  /**
   * Get a single stream by id. Requires stream ownership.
   */
  @Get(":id")
  @UseGuards(StreamOwnershipGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Get a stream",
    description: "Returns a single stream by id. Requires ownership.",
  })
  @ApiOkResponse({ description: "Stream found." })
  @ApiNotFoundResponse({ description: "Stream not found." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  @ApiForbiddenResponse({ description: "You do not own this stream." })
  async findById(@Param("id", ParseIntPipe) id: number): Promise<Stream> {
    const stream = await this.streamsService.findById(id)
    return toStreamResponse(stream)
  }

  /**
   * Update stream details (name, description, status).
   * Requires stream ownership.
   */
  @Patch(":id")
  @UseGuards(StreamOwnershipGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Update a stream",
    description: "Partially updates a stream. Requires ownership.",
  })
  @ApiOkResponse({ description: "Stream updated." })
  @ApiNotFoundResponse({ description: "Stream not found." })
  @ApiConflictResponse({ description: "Invalid status transition." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  @ApiForbiddenResponse({ description: "You do not own this stream." })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateStreamDto,
  ): Promise<Stream> {
    const stream = await this.streamsService.update(id, body)
    return toStreamResponse(stream)
  }

  /**
   * Delete a stream. Requires stream ownership.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(StreamOwnershipGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Delete a stream",
    description: "Deletes a stream by id. Requires ownership.",
  })
  @ApiNoContentResponse({ description: "Stream deleted." })
  @ApiNotFoundResponse({ description: "Stream not found." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  @ApiForbiddenResponse({ description: "You do not own this stream." })
  async delete(@Param("id", ParseIntPipe) id: number): Promise<void> {
    await this.streamsService.delete(id)
  }
}
