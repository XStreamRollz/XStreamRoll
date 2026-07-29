import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import type { StreamEventRecord } from "@xstreamroll/types"
import { PaginatedResult } from "../common/dto/pagination.dto"
import type {
  StreamListFilter,
  StreamUpdateChanges,
  StreamCreateParams,
} from "./repository/streams.repository"
import { PendingStreamEvent } from "./repository/streams.repository"
import { STREAM_EVENTS } from "../gateways/stream-events"
import { TagsService } from "../tags/tags.service"
import { WebhooksService } from "../webhooks/webhooks.service"
import { StreamsRepository } from "./repository/streams.repository"
import { StreamAnalyticsDto } from "./dto/stream-analytics.dto"
import { Stream } from "./stream.entity"
import type { StreamVisibility } from "./dto/visibility"

export interface PagedStreams extends PaginatedResult<Stream> {
  hasMore: boolean
}

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
      this.dispatchStatusWebhook(updated, changes.status)
    }

    return updated
  }

  /**
   * Fires the webhook event matching a stream's new status. Runs in the
   * background — a slow or unreachable subscriber must never delay the
   * status transition response.
   */
  private dispatchStatusWebhook(stream: Stream, newStatus: string): void {
    const event = STATUS_TO_WEBHOOK_EVENT[newStatus]
    if (!event) return

    const now = new Date().toISOString()
    const payload =
      newStatus === "error"
        ? { streamId: stream.id, userId: stream.userId, occurredAt: now }
        : newStatus === "active"
          ? { streamId: stream.id, userId: stream.userId, startedAt: now }
          : { streamId: stream.id, userId: stream.userId, stoppedAt: now }

    this.webhooksService
      .dispatchStreamEvent(stream.id, event, payload)
      .catch(() => {
        // dispatchStreamEvent already logs; swallow here so a webhook
        // fan-out failure never surfaces as an update() error.
      })
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
    offset: number,
  ): Promise<{ data: PendingStreamEvent[]; nextCursor: number | null }> {
    return this.repo.getPendingEvents(limit, offset)
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
