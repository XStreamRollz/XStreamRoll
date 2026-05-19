import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { PaginatedResult } from "../common/dto/pagination.dto"
import { TagsRepository } from "./repository/tags.repository"
import { slugify } from "./slugify"
import { Tag } from "./tag.entity"

export interface PagedTags extends PaginatedResult<Tag> {
  hasMore: boolean
}

@Injectable()
export class TagsService {
  constructor(private readonly tags: TagsRepository) {}

  list(page: number, limit: number): PagedTags {
    const { items, total } = this.tags.listPaginated(page, limit)
    return {
      data: items,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    }
  }

  /**
   * Create-or-fetch a tag from a raw name, then attach it to the stream.
   * Returns the canonical Tag row (existing or freshly created).
   */
  attachToStream(streamId: number, rawName: string): Tag {
    const slug = slugify(rawName)
    if (!slug) {
      throw new BadRequestException(
        "name must contain at least one alphanumeric character",
      )
    }
    const tag = this.tags.upsertBySlug(rawName.trim(), slug)
    this.tags.attachToStream(streamId, tag.id)
    return tag
  }

  detachFromStream(streamId: number, tagId: number): void {
    const tag = this.tags.findById(tagId)
    if (!tag) {
      throw new NotFoundException(`tag ${tagId} not found`)
    }
    const removed = this.tags.detachFromStream(streamId, tagId)
    if (!removed) {
      throw new NotFoundException(
        `tag ${tagId} is not attached to stream ${streamId}`,
      )
    }
  }
}
