import {
  Body,
  Controller,
  Delete,
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
import type { Request } from "express"
import { AuthGuard } from "../common/guards/auth.guard"
import { StreamOwnershipGuard } from "../common/guards/stream-ownership.guard"
import { CreateStreamDto } from "./dto/create-stream.dto"
import { ListStreamsQueryDto } from "./dto/list-streams.query.dto"
import { UpdateStreamDto } from "./dto/update-stream.dto"
import { StreamsService } from "./streams.service"

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
  constructor(private readonly streamsService: StreamsService) {}

  /**
   * Create a new stream. The authenticated user becomes the owner.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Create a new stream",
    description: "Creates a new stream with the authenticated user as owner.",
  })
  @ApiCreatedResponse({ description: "Stream created successfully." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  create(
    @Body() body: CreateStreamDto,
    @Req() req: Request & { auth?: { userId: number } },
  ) {
    return this.streamsService.create({
      userId: req.auth!.userId,
      name: body.name,
      description: body.description,
    })
  }

  /**
   * List all streams with optional status filter and pagination.
   */
  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "List streams",
    description:
      "Returns a paginated list of streams with optional status filter.",
  })
  @ApiOkResponse({ description: "Paginated list of streams." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  list(@Query() query: ListStreamsQueryDto) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    return this.streamsService.list(page, limit, {
      status: query.status,
    })
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
  findById(@Param("id", ParseIntPipe) id: number) {
    return this.streamsService.findById(id)
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
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateStreamDto,
  ) {
    return this.streamsService.update(id, body)
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
