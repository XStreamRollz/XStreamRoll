import { Injectable, NotFoundException } from "@nestjs/common"

import { StreamAnalyticsDto } from "../dto/stream-analytics.dto"
import { Stream } from "../stream.entity"

import type { StreamVisibility } from "../dto/visibility"
import type { StreamEventRecord } from "@xstreamroll/types"

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
 * Shape of a pending (unprocessed) stream event returned by
 * {@link StreamsRepository.getPendingEvents} and consumed by the
 * processing worker via `GET /streams/pending`.
 */
export interface PendingStreamEvent {
  streamId: string
  data: Record<string, unknown>
  timestamp: string
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
 *
 * Issues addressed here:
 *   - #393 visibility: defaults to "private" on `create`, filterable
 *     via `visibility` in `listFiltered`, mutable through `update`.
 *   - #396 event replay: `recordEvent` is called by the processing
 *     worker when it persists a processed event; `listEventsForStream`
 *     powers `GET /streams/:id/events`. The on-memory shape mirrors
 *     the `stream_events` table in `database/schema.sql`, so a
 *     future Postgres-backed implementation is a drop-in.
 */
@Injectable()
export class StreamsRepository {
  private readonly streamsById = new Map<number, Stream>()
  private nextId = 1
  /** Per-stream append-only event log, mirroring the `stream_events` table. */
  private readonly eventsByStream = new Map<number, StreamEventRecord[]>()
  private nextEventId = 1
  /** Pending (unprocessed) events, mirroring the `stream_data` table (issue #514). */
  private readonly pendingEvents: PendingStreamEvent[] = []

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
    this.eventsByStream.set(stream.id, [])
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
    this.eventsByStream.delete(id)
    return this.streamsById.delete(id)
  }

  /**
   * Append an ingested event to the pending queue (issue #514). Mirrors
   * the `INSERT INTO stream_data …` query a Postgres-backed repository
   * runs; the server stamps the timestamp.
   */
  async insertPendingEvent(
    streamId: number,
    data: Record<string, unknown>,
    timestamp: Date,
  ): Promise<PendingStreamEvent> {
    if (!this.streamsById.has(streamId)) {
      throw new NotFoundException(`stream ${streamId} not found`)
    }
    const event: PendingStreamEvent = {
      streamId: String(streamId),
      data,
      timestamp: timestamp.toISOString(),
    }
    this.pendingEvents.push(event)
    return event
  }

  /**
   * Returns a paginated slice of pending (unprocessed) stream events in
   * FIFO order. Backed by the in-memory pending queue so tests and local
   * development can exercise the full ingest → poll flow.
   */
  async getPendingEvents(
    limit: number,
    offset: number,
  ): Promise<{ data: PendingStreamEvent[]; nextCursor: number | null }> {
    const data = this.pendingEvents.slice(offset, offset + limit)
    return {
      data,
      nextCursor: data.length < limit ? null : offset + data.length,
    }
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

  // ── Event replay (#396) ──────────────────────────────────────────────────

  /**
   * Append a processed event to the in-memory log for the given
   * stream id. Mirrors the `INSERT INTO stream_events …` query a
   * Postgres-backed repository would run.
   *
   * Tests, the processing worker simulator, and the local
   * in-memory dev path use this entry point.
   */
  async recordEvent(
    streamId: number,
    event: Omit<StreamEventRecord, "id" | "streamId">,
  ): Promise<StreamEventRecord> {
    if (!this.streamsById.has(streamId)) {
      throw new Error(`stream ${streamId} not found`)
    }
    const record: StreamEventRecord = {
      id: String(this.nextEventId++),
      streamId: String(streamId),
      eventType: event.eventType,
      payload: event.payload,
      occurredAt: event.occurredAt,
    }
    const list = this.eventsByStream.get(streamId) ?? []
    list.push(record)
    this.eventsByStream.set(streamId, list)
    return record
  }

  /**
   * Returns the event replay page for `streamId`. Events are
   * returned newest-first by default so dashboards paint recent
   * activity first; the ordering matches the
   * `idx_stream_events_stream_id_created_at_desc` index for the
   * Postgres-backed implementation.
   */
  async listEventsForStream(
    streamId: number,
    page: number,
    limit: number,
  ): Promise<{ items: StreamEventRecord[]; total: number }> {
    const log = this.eventsByStream.get(streamId) ?? []
    const sorted = [...log].sort((a, b) =>
      a.occurredAt < b.occurredAt ? 1 : -1,
    )
    const offset = (page - 1) * limit
    return {
      items: sorted.slice(offset, offset + limit),
      total: sorted.length,
    }
  }
}
