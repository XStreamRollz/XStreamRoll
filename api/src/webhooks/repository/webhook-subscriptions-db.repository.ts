import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common"
import { Pool } from "pg"
import { PG_POOL } from "../../database/database.module"
import { WebhookSubscription } from "../webhook-subscription.entity"

/**
 * PostgreSQL-backed webhook subscriptions repository.
 *
 * Implements the same public API as {@link WebhookSubscriptionsRepository}
 * so the service and controller layers are unaffected by the swap.
 *
 * All queries use parameterized placeholders ($1, $2 …) — never string
 * interpolation — to prevent SQL injection.
 */
@Injectable()
export class WebhookSubscriptionsDbRepository {
  private readonly logger = new Logger(WebhookSubscriptionsDbRepository.name)

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private rowToSubscription(row: Record<string, unknown>): WebhookSubscription {
    return {
      id: row.id as number,
      userId: row.user_id as number,
      streamId: row.stream_id as number,
      url: row.url as string,
      events: row.events as string[],
      secret: row.secret as string,
      active: row.active as boolean,
      createdAt: row.created_at as Date,
    }
  }

  private handleDbError(err: unknown, context: string): never {
    this.logger.error(`DB error in ${context}`, (err as Error).stack)
    throw new ServiceUnavailableException(
      "Database is unavailable. Please try again later.",
    )
  }

  async create(data: {
    userId: number
    streamId: number
    url: string
    events: string[]
    secret: string
  }): Promise<WebhookSubscription> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `INSERT INTO webhook_subscriptions (user_id, stream_id, url, events, secret)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, stream_id, url, events, secret, active, created_at`,
        [data.userId, data.streamId, data.url, data.events, data.secret],
      )
      return this.rowToSubscription(rows[0])
    } catch (err) {
      this.handleDbError(err, "create")
    }
  }

  async findById(id: number): Promise<WebhookSubscription | undefined> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT id, user_id, stream_id, url, events, secret, active, created_at
         FROM webhook_subscriptions WHERE id = $1`,
        [id],
      )
      return rows[0] ? this.rowToSubscription(rows[0]) : undefined
    } catch (err) {
      this.handleDbError(err, "findById")
    }
  }

  async findActiveByStreamAndEvent(
    streamId: number,
    event: string,
  ): Promise<WebhookSubscription[]> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT id, user_id, stream_id, url, events, secret, active, created_at
         FROM webhook_subscriptions
         WHERE stream_id = $1 AND active = true AND $2 = ANY(events)`,
        [streamId, event],
      )
      return rows.map((r) => this.rowToSubscription(r))
    } catch (err) {
      this.handleDbError(err, "findActiveByStreamAndEvent")
    }
  }
}
