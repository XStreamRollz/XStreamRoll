import { Inject, Injectable } from "@nestjs/common"
import { Pool } from "pg"
import { PG_POOL } from "../database/database.module"
import { AuditAction } from "./audit-action.enum"

@Injectable()
export class AuditService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Persist an audit log entry.
   *
   * @param userId  - the authenticated user, or `null` for anonymous events.
   * @param action  - a value from {@link AuditAction}; never a free-form string.
   * @param metadata - structured context for the action (e.g. `{ email, reason }`).
   *                   Variable data must live here, NOT embedded in `action`.
   * @param ip      - the client IP address extracted from the request.
   */
  async log(
    userId: number | null,
    action: AuditAction,
    metadata: Record<string, unknown>,
    ip: string,
  ): Promise<void> {
    await this.pool.query(
      "INSERT INTO audit_logs (user_id, action, metadata, ip) VALUES ($1, $2, $3, $4)",
      [userId, action, JSON.stringify(metadata), ip],
    )
  }

  async findAll(page = 1, limit = 20) {
    const offset = (page - 1) * limit
    const totalResult = await this.pool.query(
      "SELECT COUNT(*)::int AS total FROM audit_logs",
    )
    const total = totalResult.rows[0]?.total ?? 0
    const { rows } = await this.pool.query(
      "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset],
    )

    return {
      data: rows,
      total,
      page,
      limit,
    }
  }
}
