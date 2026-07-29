import { Injectable } from "@nestjs/common"
import { StreamTag, Tag } from "../tag.entity"

/**
 * In-memory tags repository.
 *
 * Kept for unit testing and local development without a database.
 * The service layer depends on the {@link TAGS_REPOSITORY} injection
 * token rather than this concrete class directly, so tests can swap
 * implementations via the NestJS DI container.
 *
 * All methods are async to match the DB-backed implementation's
 * interface — this makes the two implementations interchangeable.
 */
@Injectable()
export class TagsRepository {
  private readonly tagsBySlug = new Map<string, Tag>()
  private readonly streamTags = new Map<string, StreamTag>() // key: `${streamId}:${tagId}`
  private nextId = 1

  async findBySlug(slug: string): Promise<Tag | undefined> {
    return this.tagsBySlug.get(slug)
  }

  async findById(id: number): Promise<Tag | undefined> {
    for (const tag of this.tagsBySlug.values()) {
      if (tag.id === id) return tag
    }
    return undefined
  }

  /**
   * Idempotent insert: if a tag with the same slug already exists, the
   * existing row is returned. Matches the unique-on-slug constraint
   * in the database schema.
   */
  async upsertBySlug(name: string, slug: string): Promise<Tag> {
    const existing = this.tagsBySlug.get(slug)
    if (existing) return existing
    const tag: Tag = {
      id: this.nextId++,
      name,
      slug,
      createdAt: new Date(),
    }
    this.tagsBySlug.set(slug, tag)
    return tag
  }

  /**
   * Returns a stable, alphabetically-sorted (by slug) page of tags plus
   * a total count for the pagination envelope.
   */
  async listPaginated(
    page: number,
    limit: number,
  ): Promise<{ items: Tag[]; total: number }> {
    const all = Array.from(this.tagsBySlug.values()).sort((a, b) =>
      a.slug.localeCompare(b.slug),
    )
    const offset = (page - 1) * limit
    return {
      items: all.slice(offset, offset + limit),
      total: all.length,
    }
  }

  async attachToStream(streamId: number, tagId: number): Promise<StreamTag> {
    const key = `${streamId}:${tagId}`
    const existing = this.streamTags.get(key)
    if (existing) return existing
    const row: StreamTag = { streamId, tagId, createdAt: new Date() }
    this.streamTags.set(key, row)
    return row
  }

  async detachFromStream(streamId: number, tagId: number): Promise<boolean> {
    return this.streamTags.delete(`${streamId}:${tagId}`)
  }

  async isAttached(streamId: number, tagId: number): Promise<boolean> {
    return this.streamTags.has(`${streamId}:${tagId}`)
  }

  /**
   * Batch-load tags grouped by stream id in a single pass over the
   * in-memory indexes. Every requested stream id appears as a key —
   * possibly with an empty array — so the caller can rely on
   * `map.get(id)` returning `[]` instead of `undefined` for streams
   * that have no tags attached. Tags are sorted by `slug` ascending
   * for a stable order on the wire (matches the DB implementation).
   *
   * Used by {@link StreamsService.list} to eliminate the N+1 query
   * where the dashboard previously fetched tags per stream in a loop
   * (issue #330).
   */
  async listForStreamIds(
    streamIds: number[],
  ): Promise<Map<number, Tag[]>> {
    const result = new Map<number, Tag[]>()
    if (streamIds.length === 0) return result
    for (const id of streamIds) result.set(id, [])

    // Index tagsBySlug by id so stream_tags -> tag lookup is O(1).
    const tagsById = new Map<number, Tag>()
    for (const tag of this.tagsBySlug.values()) {
      tagsById.set(tag.id, tag)
    }

    for (const { streamId, tagId } of this.streamTags.values()) {
      if (!result.has(streamId)) continue
      const tag = tagsById.get(tagId)
      if (!tag) continue
      result.get(streamId)!.push(tag)
    }

    for (const tags of result.values()) {
      tags.sort((a, b) => a.slug.localeCompare(b.slug))
    }
    return result
  }
}
