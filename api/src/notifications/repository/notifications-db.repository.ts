import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common"
import { Pool } from "pg"
import { PG_POOL } from "../../database/database.module"
import { Notification } from "../notification.entity"

/**
 * PostgreSQL-backed notifications repository.
 *
 * Implements the same public API as {@link NotificationsRepository} so the
 * service and controller layers are unaffected by the swap.
 *
 * All queries use parameterized placeholders ($1, $2 …) — never string
 * interpolation — to prevent SQL injection.
 */
@Injectable()
export class NotificationsDbRepository {
  private readonly logger = new Logger(NotificationsDbRepository.name)

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private rowToNotification(row: Record<string, unknown>): Notification {
    return {
      id: row.id as number,
      userId: row.user_id as number,
      type: row.type as string,
      payload: row.payload as Record<string, unknown>,
      readAt: (row.read_at as Date | null) ?? null,
      createdAt: row.created_at as Date,
    }
  }

  private handleDbError(err: unknown, context: string): never {
    this.logger.error(`DB error in ${context}`, (err as Error).stack)
    throw new ServiceUnavailableException(
      "Database is unavailable. Please try again later.",
    )
  }

  async create(
    userId: number,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<Notification> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `INSERT INTO notifications (user_id, type, payload)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, type, payload, read_at, created_at`,
        [userId, type, payload],
      )
      return this.rowToNotification(rows[0])
    } catch (err) {
      this.handleDbError(err, "create")
    }
  }

  async findById(id: number): Promise<Notification | undefined> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT id, user_id, type, payload, read_at, created_at
         FROM notifications WHERE id = $1`,
        [id],
      )
      return rows[0] ? this.rowToNotification(rows[0]) : undefined
    } catch (err) {
      this.handleDbError(err, "findById")
    }
  }

  async listUnreadPaginated(
    userId: number,
    page: number,
    limit: number,
  ): Promise<{ items: Notification[]; total: number }> {
    const offset = (page - 1) * limit

    try {
      const { rows: countRows } = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM notifications
         WHERE user_id = $1 AND read_at IS NULL`,
        [userId],
      )
      const total = Number(countRows[0]?.count ?? 0)

      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT id, user_id, type, payload, read_at, created_at
         FROM notifications
         WHERE user_id = $1 AND read_at IS NULL
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      )

      return { items: rows.map((r) => this.rowToNotification(r)), total }
    } catch (err) {
      this.handleDbError(err, "listUnreadPaginated")
    }
  }

  async markRead(
    userId: number,
    id: number,
  ): Promise<Notification | undefined> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `UPDATE notifications
         SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, type, payload, read_at, created_at`,
        [id, userId],
      )
      return rows[0] ? this.rowToNotification(rows[0]) : undefined
    } catch (err) {
      this.handleDbError(err, "markRead")
    }
  }

  async markAllRead(userId: number): Promise<number> {
    try {
      const { rowCount } = await this.pool.query(
        `UPDATE notifications
         SET read_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND read_at IS NULL`,
        [userId],
      )
      return rowCount ?? 0
    } catch (err) {
      this.handleDbError(err, "markAllRead")
    }
  }

  async deleteById(userId: number, id: number): Promise<boolean> {
    try {
      const { rowCount } = await this.pool.query(
        `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      return (rowCount ?? 0) > 0
    } catch (err) {
      this.handleDbError(err, "deleteById")
    }
  }
}
