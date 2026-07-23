import { Injectable } from "@nestjs/common"
import { Tag } from "../../tags/tag.entity"
import { StreamAnalyticsDto } from "../dto/stream-analytics.dto"
import { Stream } from "../stream.entity"

/**
 * Helper that mirrors the `stream_tags` join in production. Held on the
 * in-memory repository so the tag-aware variant of
 * `listPaginatedWithTags` returns the same shape as the SQL
 * implementation does (issue #330).
 */
export interface StreamTagBinding {
  streamId: number
  tagId: number
}

/**
 * In-memory streams repository.
 *
 * Kept for unit testing and local development without a database.
 * The service layer depends on the {@link STREAMS_REPOSITORY} injection
 * token rather than this concrete class directly, so tests can swap
 * implementations via the NestJS DI container.
 *
 * All methods are async to match the DB-backed implementation's
 * interface — this makes the two implementations interchangeable.
 */
@Injectable()
export class StreamsRepository {
  private readonly streamsById = new Map<number, Stream>()
  private readonly tagsBySlug = new Map<string, Tag>()
  private readonly streamTags = new Map<string, StreamTagBinding>()
  private nextId = 1

  /** Test-only seed so unit tests can pre-populate tags + bindings. */
  __seedTags(tags: Tag[], bindings: StreamTagBinding[]): void {
    for (const t of tags) this.tagsBySlug.set(t.slug, t)
    for (const b of bindings)
      this.streamTags.set(`${b.streamId}:${b.tagId}`, b)
  }

  async findById(id: number): Promise<Stream | undefined> {
    return this.streamsById.get(id)
  }

  /**
   * Returns all streams, optionally filtered by status,
   * sorted newest-first (createdAt DESC).
   */
  private listFiltered(filter?: { status?: string }): Stream[] {
    let results = Array.from(this.streamsById.values())
    if (filter?.status) {
      results = results.filter((s) => s.status === filter.status)
    }
    return results.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )
  }

  /**
   * Paginated listing.
   */
  async listPaginated(
    page: number,
    limit: number,
    filter?: { status?: string },
  ): Promise<{ items: Stream[]; total: number }> {
    const filtered = this.listFiltered(filter)
    const offset = (page - 1) * limit
    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
    }
  }

  /**
   * In-memory counterpart of `StreamsDbRepository.listPaginatedWithTags`.
   * Resolves tags from a single `stream_tags`-shaped join table so the
   * unit tests can verify behaviour parity without standing up Postgres.
   *
   * AC for issue #330: a single round-trip per call site, no per-stream
   * fan-out — satisfied here because all reads happen off the local
   * Map lookups in O(1) and there's no async fetch per stream.
   */
  async listPaginatedWithTags(
    page: number,
    limit: number,
    filter?: { status?: string },
  ): Promise<{ items: Array<Stream & { tags: Tag[] }>; total: number }> {
    const filtered = this.listFiltered(filter)
    const offset = (page - 1) * limit
    const paged = filtered.slice(offset, offset + limit)
    return {
      items: paged.map((stream) => ({
        ...stream,
        tags: this.tagsForStream(stream.id),
      })),
      total: filtered.length,
    }
  }

  private tagsForStream(streamId: number): Tag[] {
    const out: Tag[] = []
    for (const binding of this.streamTags.values()) {
      if (binding.streamId !== streamId) continue
      const tag = Array.from(this.tagsBySlug.values()).find(
        (t) => t.id === binding.tagId,
      )
      if (tag) out.push(tag)
    }
    return out.sort((a, b) => a.slug.localeCompare(b.slug))
  }

  async create(params: {
    userId: number
    name: string
    description?: string
  }): Promise<Stream> {
    const stream: Stream = {
      id: this.nextId++,
      userId: params.userId,
      name: params.name,
      description: params.description ?? null,
      status: "inactive",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.streamsById.set(stream.id, stream)
    return stream
  }

  async update(
    id: number,
    changes: { name?: string; description?: string; status?: string },
  ): Promise<Stream> {
    const stream = this.streamsById.get(id)!
    if (changes.name !== undefined) stream.name = changes.name
    if (changes.description !== undefined)
      stream.description = changes.description
    if (changes.status !== undefined) {
      stream.status = changes.status as Stream["status"]
    }
    stream.updatedAt = new Date()
    return stream
  }

  async delete(id: number): Promise<boolean> {
    return this.streamsById.delete(id)
  }

  async getAnalytics(streamId: number): Promise<StreamAnalyticsDto> {
    const now = new Date()
    const startMinute = new Date(now)
    startMinute.setSeconds(0, 0)
    startMinute.setMinutes(startMinute.getMinutes() - 59)

    const eventsPerMinute = Array.from({ length: 60 }, (_, index) => {
      const minute = new Date(startMinute)
      minute.setMinutes(startMinute.getMinutes() + index)
      return {
        minute: minute.toISOString(),
        count: 0,
      }
    })

    return {
      streamId,
      totalEventsProcessed: {
        last24h: 0,
        last7d: 0,
        last30d: 0,
      },
      errorRate: {
        window: "30d",
        totalEvents: 0,
        errorEvents: 0,
        percentage: 0,
      },
      processingLatency: {
        window: "30d",
        averageMs: null,
        p99Ms: null,
      },
      eventsPerMinute,
      generatedAt: now.toISOString(),
    }
  }
}
