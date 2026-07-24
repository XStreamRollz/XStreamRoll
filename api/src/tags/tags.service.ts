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

  async list(page: number, limit: number): Promise<PagedTags> {
    const { items, total } = await this.tags.listPaginated(page, limit)
    return {
      data: items,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    }
  }

  /**
   * Loads every tag attached to any stream in `streamIds`, grouped by
   * stream id. Powers the inline `tags` field on `GET /streams`
   * (issue #330) so the dashboard can render tag chips without a
   * second round-trip per stream.
   */
  async listForStreamIds(
    streamIds: number[],
  ): Promise<Map<number, Tag[]>> {
    // Short-circuit: empty input avoids a DB roundtrip (both in-memory
    // and DB-backed repositories short-circuit at their level too).
    if (streamIds.length === 0) return new Map()
    return this.tags.listForStreamIds(streamIds)
  }

  /**
   * Create-or-fetch a tag from a raw name, then attach it to the stream.
   * Returns the canonical Tag row (existing or freshly created).
   */
  async attachToStream(streamId: number, rawName: string): Promise<Tag> {
    const slug = slugify(rawName)
    if (!slug) {
      throw new BadRequestException(
        "name must contain at least one alphanumeric character",
      )
    }
    const tag = await this.tags.upsertBySlug(rawName.trim(), slug)
    await this.tags.attachToStream(streamId, tag.id)
    return tag
  }

  async detachFromStream(streamId: number, tagId: number): Promise<void> {
    const tag = await this.tags.findById(tagId)
    if (!tag) {
      throw new NotFoundException(`tag ${tagId} not found`)
    }
    const removed = await this.tags.detachFromStream(streamId, tagId)
    if (!removed) {
      throw new NotFoundException(
        `tag ${tagId} is not attached to stream ${streamId}`,
      )
    }
  }
}
