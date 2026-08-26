import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
} from "@nestjs/common"

import { IngestStreamEventDto } from "./dto/ingest-stream-event.dto"
import { Stream } from "./stream.entity"
import { PaginatedResult } from "../common/dto/pagination.dto"
import { STREAM_EVENTS } from "../gateways/stream-events"
import { StreamsGateway } from "../gateways/streams.gateway"
import { TagsService } from "../tags/tags.service"
import { WebhooksService } from "../webhooks/webhooks.service"
import { StreamAnalyticsDto } from "./dto/stream-analytics.dto"
import { StreamsRepository } from "./repository/streams.repository"
import { PendingStreamEvent } from "./repository/streams.repository"

import type { StreamVisibility } from "./dto/visibility"
import type {
  StreamListFilter,
  StreamUpdateChanges,
  StreamCreateParams,
} from "./repository/streams.repository"
import type { StreamEventRecord } from "@xstreamroll/types"

export interface PagedStreams extends PaginatedResult<Stream> {
  hasMore: boolean
}

/** Max serialized size of an ingested event payload (64 KiB). */
const MAX_INGEST_PAYLOAD_BYTES = 64 * 1024

/** Maps a stream's new `status` to the webhook event name it fires. */
const STATUS_TO_WEBHOOK_EVENT: Record<string, string> = {
  active: STREAM_EVENTS.STARTED,
  inactive: STREAM_EVENTS.STOPPED,
  error: STREAM_EVENTS.ERROR,
}

@Injectable()
export class StreamsService {
  constructor(
    private readonly repo: StreamsRepository,
    private readonly webhooksService: WebhooksService,
    private readonly tagsService: TagsService,
    // Optional so unit tests and any consumer that predates the socket
    // wiring can construct the service without a gateway. Mirrors the
    // `NotificationsService` injection pattern.
    @Optional() private readonly gateway?: StreamsGateway,
  ) {}

  async create(params: StreamCreateParams): Promise<Stream> {
    return this.repo.create({
      userId: params.userId,
      name: params.name.trim(),
      description: params.description?.trim(),
      visibility: params.visibility,
    })
  }

  /**
   * Paginated listing filtered for the caller's visibility rules:
   *   - public streams are visible to every authenticated user;
   *   - private streams are visible only to their owner.
   *
   * Pass {@link StreamListFilter.ownerOnly} to restrict the result to
   * the caller's own streams regardless of visibility (useful for a
   * "my streams" tab). Pass {@link StreamListFilter.visibility} to
   * narrow the visible-to-caller set further.
   *
   * Also batches tags inline (issue #330) so the dashboard can render
   * tag chips without a second HTTP call per row.
   */
  async list(
    page: number,
    limit: number,
    viewerUserId: number,
    filter?: StreamListFilter,
  ): Promise<PagedStreams> {
    if (!Number.isInteger(viewerUserId) || viewerUserId <= 0) {
      throw new NotFoundException("invalid viewer")
    }
    const { items, total } = await this.repo.listPaginated(
      page,
      limit,
      viewerUserId,
      filter,
    )
    const tagsByStream = await this.tagsService.listForStreamIds(
      items.map((s) => s.id),
    )
    const data: Stream[] = items.map((s) => ({
      ...s,
      tags: tagsByStream.get(s.id) ?? [],
    }))
    return {
      data,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    }
  }

  async findById(id: number): Promise<Stream> {
    const stream = await this.repo.findById(id)
    if (!stream) {
      throw new NotFoundException(`stream ${id} not found`)
    }
    return stream
  }

  async update(id: number, changes: StreamUpdateChanges): Promise<Stream> {
    const stream = await this.findById(id)

    // Validate status transitions before hitting the DB.
    if (changes.status !== undefined) {
      this.validateStatusTransition(stream.status, changes.status)
    }

    const updated = await this.repo.update(id, {
      name: changes.name?.trim(),
      description: changes.description?.trim(),
      status: changes.status,
      visibility: changes.visibility,
    })

    if (changes.status !== undefined && changes.status !== stream.status) {
      this.dispatchStatusSideEffects(updated, changes.status)
    }

    return updated
  }

  /**
   * Fires the side effects that accompany a stream status transition:
   * the matching webhook event (fire-and-forget) and the matching
   * socket broadcast scoped to the stream's room (issue #519). Both
   * paths derive their payloads from the same `now`/`base` values so
   * they cannot drift, and each is independent — a failed webhook
   * dispatch never suppresses the socket emit.
   */
  private dispatchStatusSideEffects(stream: Stream, newStatus: string): void {
    const event = STATUS_TO_WEBHOOK_EVENT[newStatus]
    if (!event) return

    const now = new Date().toISOString()
    const base = { streamId: stream.id, userId: stream.userId } as const

    const webhookPayload =
      newStatus === "error"
        ? { ...base, occurredAt: now }
        : newStatus === "active"
          ? { ...base, startedAt: now }
          : { ...base, stoppedAt: now }

    // Webhook fan-out is fire-and-forget — a slow or unreachable
    // subscriber must never delay the status transition response.
    this.webhooksService
      .dispatchStreamEvent(stream.id, event, webhookPayload)
      .catch(() => {
        // dispatchStreamEvent already logs; swallow here so a webhook
        // fan-out failure never surfaces as an update() error.
      })

    // Socket broadcast is independent of webhook delivery: a failed
    // webhook dispatch must not suppress the live status update.
    switch (newStatus) {
      case "active":
        this.gateway?.emitStarted({ ...base, startedAt: now })
        break
      case "inactive":
        this.gateway?.emitStopped({ ...base, stoppedAt: now })
        break
      case "error":
        // The webhook payload has no code/message; the socket wire
        // contract requires them, so the emit supplies defaults.
        this.gateway?.emitError({
          ...base,
          occurredAt: now,
          code: "STREAM_ERROR",
          message: `stream ${stream.id} entered error state`,
        })
        break
    }
  }

  async delete(id: number): Promise<void> {
    const exists = await this.repo.delete(id)
    if (!exists) {
      throw new NotFoundException(`stream ${id} not found`)
    }
  }

  /**
   * Returns a paginated batch of unprocessed stream events for the worker.
   *
   * @param limit  - Maximum number of events to return (controlled by
   *                 the worker's `POLL_BATCH_SIZE` env var, default 100).
   * @param offset - Cursor / offset for the next page.  The worker
   *                 advances this by `limit` until `nextCursor` is `null`.
   */
  async getPendingEvents(
    limit: number,
    cursor: string | null,
  ): Promise<{ data: PendingStreamEvent[]; nextCursor: string | null }> {
    return this.repo.getPendingEvents(limit, cursor)
  }

  /**
   * Ingests a single event into `stream_data` — the worker's poll source
   * (issue #514). The server stamps the arrival timestamp; oversized
   * payloads are rejected before touching the database.
   */
  async ingestEvent(dto: IngestStreamEventDto): Promise<PendingStreamEvent> {
    // `data` must be a plain JSON object (the DTO's IsDefined only guards
    // presence; the whitelist pipe strips nothing with a decorator).
    if (dto.data === null || typeof dto.data !== "object" || Array.isArray(dto.data)) {
      throw new BadRequestException("data must be a JSON object")
    }
    const serialized = JSON.stringify(dto.data)
    if (serialized.length > MAX_INGEST_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `event payload exceeds ${MAX_INGEST_PAYLOAD_BYTES} bytes`,
      )
    }
    return this.repo.insertPendingEvent(
      Number(dto.streamId),
      dto.data,
      new Date(),
    )
  }

  async getAnalytics(id: number): Promise<StreamAnalyticsDto> {
    await this.findById(id)
    return this.repo.getAnalytics(id)
  }

  // ── Stream event replay (#396) ───────────────────────────────────────────

  /**
   * Returns the most recent events for a stream, paginated. The
   * single-stream read is owner-only via the upstream
   * `StreamOwnershipGuard`; visibility on this endpoint is not
   * affected by `Stream.visibility` because event payloads are
   * private regardless of metadata visibility.
   */
  async listEvents(
    id: number,
    page: number,
    limit: number,
  ): Promise<{
    data: StreamEventRecord[]
    page: number
    limit: number
    total: number
    hasMore: boolean
  }> {
    await this.findById(id)
    const { items, total } = await this.repo.listEventsForStream(
      id,
      page,
      limit,
    )
    return {
      data: items,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    }
  }

  /**
   * Enforces valid status transitions:
   *   inactive → active   (start streaming)
   *   active   → inactive (stop streaming)
   *   *        → error    (any status can transition to error)
   *   error    → inactive (recover from error)
   */
  private validateStatusTransition(current: string, next: string): void {
    const allowed: Record<string, string[]> = {
      inactive: ["active", "error"],
      active: ["inactive", "error"],
      error: ["inactive"],
    }

    const allowedTransitions = allowed[current]
    if (!allowedTransitions?.includes(next)) {
      throw new ConflictException(
        `cannot transition stream from "${current}" to "${next}"`,
      )
    }
  }
}

// Re-export the visibility type so callers don't have to import from
// two places when they want a fully-typed service contract.
export type { StreamVisibility }
