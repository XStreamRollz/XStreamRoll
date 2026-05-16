import { Injectable } from "@nestjs/common"

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
 * The current implementation returns a deterministic, zero-valued
 * snapshot — it exists so the endpoint, guard, and 60-second cache
 * can be wired and exercised end-to-end before the Postgres data
 * layer lands.
 *
 * When the DB layer is available the four numeric fields will be
 * computed via the following aggregate queries (single round-trip):
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
  async compute(): Promise<AdminStats> {
    // Placeholder zero snapshot. The query above replaces this body
    // once the DB module is wired.
    return {
      totalUsers: 0,
      totalStreams: 0,
      activeStreams: 0,
      eventsLast24h: 0,
      generatedAt: new Date().toISOString(),
    }
  }
}
