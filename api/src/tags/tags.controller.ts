import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common"
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
} from "@nestjs/swagger"

import { CreateTagDto } from "./dto/create-tag.dto"
import { ListTagsQueryDto } from "./dto/list-tags.query.dto"
import { TagsService } from "./tags.service"
import { StreamOwnershipGuard } from "../common/guards/stream-ownership.guard"

/**
 * Public, paginated list of all tags in the system.
 *
 *   GET /tags?page=1&limit=20
 */
@Controller("tags")
export class TagsListController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  list(@Query() query: ListTagsQueryDto) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    return this.tagsService.list(page, limit)
  }
}

/**
 * Stream-scoped tag management. All endpoints require ownership of the
 * referenced stream, enforced via {@link StreamOwnershipGuard}.
 *
 *   GET    /streams/:id/tags          -> PagedTags
 *   POST   /streams/:id/tags          { name: "Live Streaming" }
 *   DELETE /streams/:id/tags/:tagId
 */
@Controller("streams/:id/tags")
@UseGuards(StreamOwnershipGuard)
export class StreamTagsController {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * Lists the tags attached to a stream (issue #517). The response
   * uses the same `PagedTags` envelope as `GET /tags` so the dashboard's
   * `useStreamTags` hook can parse it without a second shape. Ownership
   * is enforced by {@link StreamOwnershipGuard} — non-owners get 403.
   */
  @Get()
  @ApiOperation({ summary: "List tags attached to a stream" })
  @ApiOkResponse({
    description: "The tags attached to the stream, in a PagedTags envelope",
  })
  @ApiForbiddenResponse({ description: "You do not own this stream." })
  list(
    @Param("id", ParseIntPipe) streamId: number,
    @Query() query: ListTagsQueryDto,
  ) {
    const page = query.page ?? 1
    const limit = query.limit ?? 50
    return this.tagsService.listForStream(streamId, page, limit)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  attach(
    @Param("id", ParseIntPipe) streamId: number,
    @Body() body: CreateTagDto,
  ) {
    return this.tagsService.attachToStream(streamId, body.name)
  }

  @Delete(":tagId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async detach(
    @Param("id", ParseIntPipe) streamId: number,
    @Param("tagId", ParseIntPipe) tagId: number,
  ): Promise<void> {
    await this.tagsService.detachFromStream(streamId, tagId)
  }
}
