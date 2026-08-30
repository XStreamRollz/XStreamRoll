import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common"
import { Pool } from "pg"

import { PG_POOL } from "../database/database.module"

export interface AdminStats {
  totalUsers: number
  totalStreams: number
  activeStreams: number
  eventsLast24h: number
  generatedAt: string
}

/**
 * Aggregates platform-wide stats for the admin dashboard.
 *
 * The four numeric fields are computed with aggregate subqueries in a
 * single database round-trip. Active streams are those whose status is
 * `active` at query time, and eventsLast24h covers events created within
 * the preceding 24 hours.
 *
 *   SELECT
 *     (SELECT COUNT(*) FROM users)                                AS total_users,
 *     (SELECT COUNT(*) FROM streams)                              AS total_streams,
 *     (SELECT COUNT(*) FROM streams WHERE status = 'active')      AS active_streams,
 *     (SELECT COUNT(*) FROM stream_events
 *        WHERE created_at > NOW() - INTERVAL '24 hours')          AS events_24h;
 *
 * Each subquery is index-friendly given the existing indexes on
 * \`streams(user_id)\` and \`stream_events(created_at)\`.
 */
@Injectable()
export class AdminStatsService {
  private readonly logger = new Logger(AdminStatsService.name)

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private handleDbError(err: unknown): never {
    this.logger.error("DB error in compute", (err as Error).stack)
    throw new ServiceUnavailableException(
      "Database is unavailable. Please try again later.",
    )
  }

  async compute(): Promise<AdminStats> {
    try {
      const { rows } = await this.pool.query<{
        total_users: number
        total_streams: number
        active_streams: number
        events_24h: number
      }>(`SELECT
           (SELECT COUNT(*)::int FROM users) AS total_users,
           (SELECT COUNT(*)::int FROM streams) AS total_streams,
           (SELECT COUNT(*)::int FROM streams WHERE status = 'active') AS active_streams,
           (SELECT COUNT(*)::int FROM stream_events
            WHERE created_at > NOW() - INTERVAL '24 hours') AS events_24h`)

      const row = rows[0]
      return {
        totalUsers: Number(row?.total_users ?? 0),
        totalStreams: Number(row?.total_streams ?? 0),
        activeStreams: Number(row?.active_streams ?? 0),
        eventsLast24h: Number(row?.events_24h ?? 0),
        generatedAt: new Date().toISOString(),
      }
    } catch (err) {
      this.handleDbError(err)
    }
  }
}
