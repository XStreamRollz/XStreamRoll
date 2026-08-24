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

  /**
   * Paginated list of a user's subscriptions, newest first. Pass
   * `streamId` to narrow to a single stream. The caller's ownership is
   * enforced by the `user_id` filter itself — a user can only ever
   * list their own subscriptions.
   */
  async listByUser(
    userId: number,
    page: number,
    limit: number,
    streamId?: number,
  ): Promise<{ items: WebhookSubscription[]; total: number }> {
    const offset = (page - 1) * limit
    const where = [`user_id = $1`]
    const params: Array<string | number> = [userId]
    if (streamId !== undefined) {
      params.push(streamId)
      where.push(`stream_id = $${params.length}`)
    }

    try {
      const { rows: countRows } = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM webhook_subscriptions
         WHERE ${where.join(" AND ")}`,
        params,
      )
      const total = Number(countRows[0]?.count ?? 0)

      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT id, user_id, stream_id, url, events, secret, active, created_at
         FROM webhook_subscriptions
         WHERE ${where.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      )

      return { items: rows.map((r) => this.rowToSubscription(r)), total }
    } catch (err) {
      this.handleDbError(err, "listByUser")
    }
  }

  /**
   * Applies a partial update. Only the fields present in `changes` are
   * touched — notably there is no `secret` key, so a caller can never
   * rotate the signing secret through this path. All values are bound
   * as parameters, never interpolated.
   */
  async update(
    id: number,
    changes: { url?: string; events?: string[]; active?: boolean },
  ): Promise<WebhookSubscription | undefined> {
    const assignments: string[] = []
    const params: Array<string | number | boolean | string[]> = [id]
    if (changes.url !== undefined) {
      params.push(changes.url)
      assignments.push(`url = $${params.length}`)
    }
    if (changes.events !== undefined) {
      params.push(changes.events)
      assignments.push(`events = $${params.length}`)
    }
    if (changes.active !== undefined) {
      params.push(changes.active)
      assignments.push(`active = $${params.length}`)
    }
    if (assignments.length === 0) return undefined

    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `UPDATE webhook_subscriptions
         SET ${assignments.join(", ")}
         WHERE id = $1
         RETURNING id, user_id, stream_id, url, events, secret, active, created_at`,
        params,
      )
      return rows[0] ? this.rowToSubscription(rows[0]) : undefined
    } catch (err) {
      this.handleDbError(err, "update")
    }
  }

  /** Returns true when a subscription was deleted, false when it didn't exist. */
  async delete(id: number): Promise<boolean> {
    try {
      // webhook_deliveries rows cascade on subscription deletion (see
      // database/schema.sql), so one DELETE removes the whole record.
      const { rowCount } = await this.pool.query(
        `DELETE FROM webhook_subscriptions WHERE id = $1`,
        [id],
      )
      return (rowCount ?? 0) > 0
    } catch (err) {
      this.handleDbError(err, "delete")
    }
  }
}
