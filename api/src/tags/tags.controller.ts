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
import { StreamOwnershipGuard } from "../common/guards/stream-ownership.guard"
import { CreateTagDto } from "./dto/create-tag.dto"
import { ListTagsQueryDto } from "./dto/list-tags.query.dto"
import { TagsService } from "./tags.service"

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
 * Stream-scoped tag management. Both endpoints require ownership of the
 * referenced stream, enforced via {@link StreamOwnershipGuard}.
 *
 *   POST   /streams/:id/tags          { name: "Live Streaming" }
 *   DELETE /streams/:id/tags/:tagId
 */
@Controller("streams/:id/tags")
@UseGuards(StreamOwnershipGuard)
export class StreamTagsController {
  constructor(private readonly tagsService: TagsService) {}

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
