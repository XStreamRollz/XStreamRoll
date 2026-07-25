import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { PaginatedResult } from "../common/dto/pagination.dto"
import { STREAM_EVENTS } from "../gateways/stream-events"
import { TagsService } from "../tags/tags.service"
import { WebhooksService } from "../webhooks/webhooks.service"
import { StreamAnalyticsDto } from "./dto/stream-analytics.dto"
import { StreamsRepository } from "./repository/streams.repository"
import { Stream } from "./stream.entity"

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

  async create(dto: {
    userId: number
    name: string
    description?: string
  }): Promise<Stream> {
    return this.repo.create({
      userId: dto.userId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
    })
  }

  /**
   * Lists streams with tags inline.
   *
   * The previous implementation issued one query for the streams page
   * and then one `GET /streams/:id/tags` roundtrip per row — a
   * classic N+1. Issue #330 replaced that with a single batch fetch:
   * `repo.listPaginated()` returns plain streams, then
   * `tagsService.listForStreamIds()` groups every attached tag by
   * stream id in one DB roundtrip (in-memory: one pass over the
   * existing indexes; DB: one `SELECT ... WHERE stream_id = ANY($1)`
   * using the composite PK on `stream_tags`).
   *
   * Every stream in the response carries a `tags: Tag[]` field —
   * empty arrays for streams with no tags — so the dashboard can
   * render tag chips without a second HTTP call per row.
   */
  async list(
    page: number,
    limit: number,
    filter?: { status?: string },
  ): Promise<PagedStreams> {
    const { items, total } = await this.repo.listPaginated(
      page,
      limit,
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

  async update(
    id: number,
    changes: { name?: string; description?: string; status?: string },
  ): Promise<Stream> {
    const stream = await this.findById(id)

    // Validate status transitions before hitting the DB.
    if (changes.status !== undefined) {
      this.validateStatusTransition(stream.status, changes.status)
    }

    const updated = await this.repo.update(id, {
      name: changes.name?.trim(),
      description: changes.description?.trim(),
      status: changes.status,
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

  async getAnalytics(id: number): Promise<StreamAnalyticsDto> {
    await this.findById(id)
    return this.repo.getAnalytics(id)
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
