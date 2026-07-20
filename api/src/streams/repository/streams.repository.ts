import { Injectable } from "@nestjs/common"
import { StreamAnalyticsDto } from "../dto/stream-analytics.dto"
import type { StreamVisibility } from "../dto/visibility"
import { Stream } from "../stream.entity"

export interface StreamCreateParams {
  userId: number
  name: string
  description?: string
  visibility?: StreamVisibility
}

export interface StreamUpdateChanges {
  name?: string
  description?: string
  status?: string
  visibility?: StreamVisibility
}

/**
 * Filter passed to listing endpoints. The repository applies visibility
 * semantics so the service layer is a pass-through; it never has to
 * reason about who can see what.
 */
export interface StreamListFilter {
  status?: string
  visibility?: StreamVisibility
  /**
   * If true, restrict results to streams owned by the viewer
   * regardless of the stream's own visibility. Defaults to false.
   */
  ownerOnly?: boolean
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
  private nextId = 1

  async findById(id: number): Promise<Stream | undefined> {
    return this.streamsById.get(id)
  }

  /**
   * Returns all streams visible to `viewerUserId`, optionally further
   * narrowed by status, visibility, and an owner-only flag. Sorted
   * newest-first (createdAt DESC).
   */
  private listFiltered(
    viewerUserId: number,
    filter?: StreamListFilter,
  ): Stream[] {
    let results = Array.from(this.streamsById.values())
    if (filter?.status) {
      results = results.filter((s) => s.status === filter.status)
    }
    // Apply visibility ACL (issue #393):
    //   - ownerOnly → only the caller's streams
    //   - otherwise → public streams + the caller's own streams
    if (filter?.ownerOnly) {
      results = results.filter((s) => s.userId === viewerUserId)
    } else {
      results = results.filter(
        (s) => s.visibility === "public" || s.userId === viewerUserId,
      )
    }
    // Optional visibility narrowing on top of the ACL.
    if (filter?.visibility) {
      results = results.filter((s) => s.visibility === filter.visibility)
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
    viewerUserId: number,
    filter?: StreamListFilter,
  ): Promise<{ items: Stream[]; total: number }> {
    const filtered = this.listFiltered(viewerUserId, filter)
    const offset = (page - 1) * limit
    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
    }
  }

  async create(params: StreamCreateParams): Promise<Stream> {
    const stream: Stream = {
      id: this.nextId++,
      userId: params.userId,
      name: params.name,
      description: params.description ?? null,
      status: "inactive",
      visibility: params.visibility ?? "private",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.streamsById.set(stream.id, stream)
    return stream
  }

  async update(id: number, changes: StreamUpdateChanges): Promise<Stream> {
    const stream = this.streamsById.get(id)!
    if (changes.name !== undefined) stream.name = changes.name
    if (changes.description !== undefined)
      stream.description = changes.description
    if (changes.status !== undefined) {
      stream.status = changes.status as Stream["status"]
    }
    if (changes.visibility !== undefined) {
      stream.visibility = changes.visibility
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
