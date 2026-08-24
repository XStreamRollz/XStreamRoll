import { Inject, Injectable, Logger, Optional } from "@nestjs/common"
import { Pool } from "pg"

import { AuditAction } from "./audit-action.enum"
import { PG_POOL } from "../database/database.module"
import { MetricsService } from "../metrics/metrics.service"

/**
 * Audit logging for security-relevant actions.
 *
 * Fail-open policy (issue #530): audit writes are an observability
 * concern, not a trust boundary for the audited action. A failed
 * INSERT must never fail the request being audited — a DB hiccup on
 * the audit table must not turn a valid login into a 503. Primary
 * request paths MUST go through {@link logSafely}, which absorbs the
 * failure (structured log + `audit_log_write_failures_total` metric)
 * and lets the audited action proceed. The raw {@link log} method
 * stays fail-closed (it throws) so callers can still observe write
 * failures directly; it is intentionally not awaited from request
 * handlers.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  /**
   * Persist an audit log entry.
   *
   * Fail-closed primitive: throws on any database error. Do NOT await
   * this from a primary request path — use {@link logSafely} instead
   * so an audit write failure cannot fail the audited action
   * (fail-open policy, issue #530).
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

  /**
   * Fail-open wrapper around {@link log} for primary request paths.
   *
   * Deliberate trade-off (see module comment): if the audit INSERT
   * fails (DB down, constraint, timeout), the failure is logged with
   * the action, user, and IP that would have been recorded and counted
   * in `audit_log_write_failures_total`, then swallowed — the audited
   * action proceeds. Audit coverage degrades visibly during a DB
   * outage instead of taking login/register down with it.
   *
   * Never throws. Safe to await anywhere. On success behaves exactly
   * like {@link log} — a single write, no retry, no duplicate row.
   */
  async logSafely(
    userId: number | null,
    action: AuditAction,
    metadata: Record<string, unknown>,
    ip: string,
  ): Promise<void> {
    try {
      await this.log(userId, action, metadata, ip)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `audit log write failed (action=${action}, userId=${userId}, ip=${ip}): ${message}`,
        err instanceof Error ? err.stack : undefined,
      )
      this.metricsService?.auditLogWriteFailuresTotal.inc({ action })
    }
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
