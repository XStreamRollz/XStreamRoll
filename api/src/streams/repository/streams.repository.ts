import { Injectable } from "@nestjs/common"
import { Stream } from "../stream.entity"
import { StreamEventRecord } from "../stream-event.entity"

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
  private readonly eventsByStreamId = new Map<number, StreamEventRecord[]>()
  private nextId = 1
  private nextEventId = 1

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

  async findEventsByStreamId(
    streamId: number,
    params: { since?: string; limit: number; cursor?: number },
  ): Promise<{ events: StreamEventRecord[]; nextCursor: number | null }> {
    const all = this.eventsByStreamId.get(streamId) ?? []

    let filtered = all

    if (params.since) {
      const sinceDate = new Date(params.since)
      filtered = filtered.filter((e) => e.occurredAt >= sinceDate)
    }

    if (params.cursor) {
      const cursorIndex = filtered.findIndex((e) => e.id === params.cursor)
      if (cursorIndex !== -1) {
        filtered = filtered.slice(cursorIndex + 1)
      }
    }

    const limit = params.limit
    const events = filtered.slice(0, limit)
    const nextCursor =
      filtered.length > limit ? filtered[limit - 1].id : null

    return { events, nextCursor }
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
}
