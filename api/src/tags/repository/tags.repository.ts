import { Injectable } from "@nestjs/common"
import { StreamTag, Tag } from "../tag.entity"

/**
 * In-memory tags repository.
 *
 * This module is deliberately persistence-agnostic: the controller and
 * service only depend on the public methods exposed here. Once the
 * Postgres TypeORM/Prisma layer lands the class will be swapped for a
 * concrete DB-backed repository without touching higher layers.
 */
@Injectable()
export class TagsRepository {
  private readonly tagsBySlug = new Map<string, Tag>()
  private readonly streamTags = new Map<string, StreamTag>() // key: `${streamId}:${tagId}`
  private nextId = 1

  findBySlug(slug: string): Tag | undefined {
    return this.tagsBySlug.get(slug)
  }

  findById(id: number): Tag | undefined {
    for (const tag of this.tagsBySlug.values()) {
      if (tag.id === id) return tag
    }
    return undefined
  }

  /**
   * Idempotent insert: if a tag with the same slug already exists, the
   * existing row is returned. This matches the "unique on slug" semantic
   * we want from a future DB index.
   */
  upsertBySlug(name: string, slug: string): Tag {
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
   * Returns a stable, alphabetically-sorted page of tags plus a total
   * count so the controller can produce a complete pagination envelope.
   */
  listPaginated(page: number, limit: number): { items: Tag[]; total: number } {
    const all = Array.from(this.tagsBySlug.values()).sort((a, b) =>
      a.slug.localeCompare(b.slug),
    )
    const offset = (page - 1) * limit
    return {
      items: all.slice(offset, offset + limit),
      total: all.length,
    }
  }

  attachToStream(streamId: number, tagId: number): StreamTag {
    const key = `${streamId}:${tagId}`
    const existing = this.streamTags.get(key)
    if (existing) return existing
    const row: StreamTag = { streamId, tagId, createdAt: new Date() }
    this.streamTags.set(key, row)
    return row
  }

  detachFromStream(streamId: number, tagId: number): boolean {
    return this.streamTags.delete(`${streamId}:${tagId}`)
  }

  isAttached(streamId: number, tagId: number): boolean {
    return this.streamTags.has(`${streamId}:${tagId}`)
  }
}
