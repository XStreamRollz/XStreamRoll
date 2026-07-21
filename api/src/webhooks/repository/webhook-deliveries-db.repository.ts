import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common"
import { Pool } from "pg"
import { PG_POOL } from "../../database/database.module"
import { WebhookDelivery } from "../webhook-delivery.entity"
import { RecordAttemptInput } from "./webhook-deliveries.repository"

/**
 * PostgreSQL-backed webhook deliveries repository.
 *
 * Implements the same public API as {@link WebhookDeliveriesRepository} so
 * the service and controller layers are unaffected by the swap.
 *
 * All queries use parameterized placeholders ($1, $2 …) — never string
 * interpolation — to prevent SQL injection.
 */
@Injectable()
export class WebhookDeliveriesDbRepository {
  private readonly logger = new Logger(WebhookDeliveriesDbRepository.name)

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private rowToDelivery(row: Record<string, unknown>): WebhookDelivery {
    return {
      id: row.id as number,
      webhookSubscriptionId: row.webhook_subscription_id as number,
      event: row.event as string,
      payload: row.payload as Record<string, unknown>,
      status: row.status as WebhookDelivery["status"],
      attemptCount: row.attempt_count as number,
      lastStatusCode: (row.last_status_code as number | null) ?? null,
      lastResponseBody: (row.last_response_body as string | null) ?? null,
      lastError: (row.last_error as string | null) ?? null,
      nextAttemptAt: (row.next_attempt_at as Date | null) ?? null,
      deliveredAt: (row.delivered_at as Date | null) ?? null,
      createdAt: row.created_at as Date,
    }
  }

  private handleDbError(err: unknown, context: string): never {
    this.logger.error(`DB error in ${context}`, (err as Error).stack)
    throw new ServiceUnavailableException(
      "Database is unavailable. Please try again later.",
    )
  }

  private static readonly SELECT_COLUMNS = `
    id, webhook_subscription_id, event, payload, status, attempt_count,
    last_status_code, last_response_body, last_error, next_attempt_at,
    delivered_at, created_at
  `

  async create(
    webhookSubscriptionId: number,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<WebhookDelivery> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `INSERT INTO webhook_deliveries
           (webhook_subscription_id, event, payload, status, attempt_count, next_attempt_at)
         VALUES ($1, $2, $3, 'pending', 0, CURRENT_TIMESTAMP)
         RETURNING ${WebhookDeliveriesDbRepository.SELECT_COLUMNS}`,
        [webhookSubscriptionId, event, payload],
      )
      return this.rowToDelivery(rows[0])
    } catch (err) {
      this.handleDbError(err, "create")
    }
  }

  async findById(id: number): Promise<WebhookDelivery | undefined> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT ${WebhookDeliveriesDbRepository.SELECT_COLUMNS}
         FROM webhook_deliveries WHERE id = $1`,
        [id],
      )
      return rows[0] ? this.rowToDelivery(rows[0]) : undefined
    } catch (err) {
      this.handleDbError(err, "findById")
    }
  }

  async listBySubscriptionPaginated(
    webhookSubscriptionId: number,
    page: number,
    limit: number,
  ): Promise<{ items: WebhookDelivery[]; total: number }> {
    const offset = (page - 1) * limit

    try {
      const { rows: countRows } = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM webhook_deliveries
         WHERE webhook_subscription_id = $1`,
        [webhookSubscriptionId],
      )
      const total = Number(countRows[0]?.count ?? 0)

      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT ${WebhookDeliveriesDbRepository.SELECT_COLUMNS}
         FROM webhook_deliveries
         WHERE webhook_subscription_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [webhookSubscriptionId, limit, offset],
      )

      return { items: rows.map((r) => this.rowToDelivery(r)), total }
    } catch (err) {
      this.handleDbError(err, "listBySubscriptionPaginated")
    }
  }

  async findDuePending(limit: number): Promise<WebhookDelivery[]> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT ${WebhookDeliveriesDbRepository.SELECT_COLUMNS}
         FROM webhook_deliveries
         WHERE status = 'pending' AND next_attempt_at <= CURRENT_TIMESTAMP
         ORDER BY created_at ASC
         LIMIT $1`,
        [limit],
      )
      return rows.map((r) => this.rowToDelivery(r))
    } catch (err) {
      this.handleDbError(err, "findDuePending")
    }
  }

  async recordAttempt(
    id: number,
    result: RecordAttemptInput,
  ): Promise<WebhookDelivery | undefined> {
    const status = result.success ? "success" : result.nextAttemptAt ? "pending" : "failed"

    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `UPDATE webhook_deliveries
         SET attempt_count = attempt_count + 1,
             last_status_code = $2,
             last_response_body = $3,
             last_error = $4,
             next_attempt_at = $5,
             status = $6,
             delivered_at = CASE WHEN $7 THEN CURRENT_TIMESTAMP ELSE delivered_at END
         WHERE id = $1
         RETURNING ${WebhookDeliveriesDbRepository.SELECT_COLUMNS}`,
        [
          id,
          result.statusCode,
          result.responseBody,
          result.error,
          result.nextAttemptAt,
          status,
          result.success,
        ],
      )
      return rows[0] ? this.rowToDelivery(rows[0]) : undefined
    } catch (err) {
      this.handleDbError(err, "recordAttempt")
    }
  }
}
