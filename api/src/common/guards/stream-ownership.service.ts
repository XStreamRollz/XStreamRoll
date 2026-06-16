import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common"
import { Pool } from "pg"
import { env } from "../../config/env"

/**
 * Verifies stream ownership by querying the `streams` table directly.
 *
 * Replaces the previous demo-only implementation that relied on the
 * STREAM_OWNERSHIP_DEMO environment variable with a deny-all fallback.
 *
 * Uses a parameterized query to prevent SQL injection.
 */
@Injectable()
export class StreamOwnershipService {
  private readonly pool: Pool
  private readonly logger = new Logger(StreamOwnershipService.name)

  constructor() {
    this.pool = new Pool({ connectionString: env.DATABASE_URL })

    this.pool.on("error", (err) => {
      this.logger.error("Unexpected PostgreSQL pool error", err.stack)
    })
  }

  /**
   * Returns true when the given user owns the given stream.
   *
   * Throws {@link ServiceUnavailableException} if the database is
   * unreachable so upstream guards can surface a 503 rather than a
   * misleading 403.
   */
  async ownsStream(userId: number, streamId: number): Promise<boolean> {
    try {
      const { rows } = await this.pool.query<{ user_id: number }>(
        `SELECT user_id FROM streams WHERE id = $1`,
        [streamId],
      )

      if (!rows[0]) {
        // Stream does not exist — treat as not owned.
        return false
      }

      return rows[0].user_id === userId
    } catch (err) {
      this.logger.error(
        `DB error checking ownership for stream ${streamId}`,
        (err as Error).stack,
      )
      throw new ServiceUnavailableException(
        "Database is unavailable. Please try again later.",
      )
    }
  }
}
