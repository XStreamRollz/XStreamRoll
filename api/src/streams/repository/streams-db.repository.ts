import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common"
import { Pool } from "pg"
import { PG_POOL } from "../../database/database.module"
import { StreamAnalyticsDto } from "../dto/stream-analytics.dto"
import { Stream } from "../stream.entity"

/**
 * PostgreSQL-backed streams repository.
 *
 * Implements the same public API as {@link StreamsRepository} so the
 * service and controller layers are unaffected by the swap.
 *
 * All queries use parameterized placeholders ($1, $2 …) — never string
 * interpolation — to prevent SQL injection.
 */
@Injectable()
export class StreamsDbRepository {
  private readonly logger = new Logger(StreamsDbRepository.name)

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Map a raw DB row to the Stream entity shape. */
  private rowToStream(row: Record<string, unknown>): Stream {
    return {
      id: row.id as number,
      userId: row.user_id as number,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      status: row.status as Stream["status"],
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    }
  }

  /** Wrap pg errors in a NestJS-friendly exception. */
  private handleDbError(err: unknown, context: string): never {
    this.logger.error(`DB error in ${context}`, (err as Error).stack)
    throw new ServiceUnavailableException(
      "Database is unavailable. Please try again later.",
    )
  }

  async findById(id: number): Promise<Stream | undefined> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT id, user_id, name, description, status, created_at, updated_at
         FROM streams
         WHERE id = $1`,
        [id],
      )
      return rows[0] ? this.rowToStream(rows[0]) : undefined
    } catch (err) {
      this.handleDbError(err, "findById")
    }
  }

  /**
   * Paginated listing with optional status filter.
   * Returns rows sorted newest-first (created_at DESC) to match
   * the behaviour of the in-memory repository.
   */
  async listPaginated(
    page: number,
    limit: number,
    filter?: { status?: string },
  ): Promise<{ items: Stream[]; total: number }> {
    const offset = (page - 1) * limit
    const params: unknown[] = []

    // Build a single WHERE clause shared by both queries.
    let where = ""
    if (filter?.status) {
      params.push(filter.status)
      where = `WHERE status = $${params.length}`
    }

    try {
      const countParams = [...params]
      const { rows: countRows } = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM streams ${where}`,
        countParams,
      )
      const total = Number(countRows[0]?.count ?? 0)

      const itemParams = [...params, limit, offset]
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT id, user_id, name, description, status, created_at, updated_at
         FROM streams
         ${where}
         ORDER BY created_at DESC
         LIMIT $${itemParams.length - 1} OFFSET $${itemParams.length}`,
        itemParams,
      )

      return { items: rows.map((r) => this.rowToStream(r)), total }
    } catch (err) {
      this.handleDbError(err, "listPaginated")
    }
  }

  async create(params: {
    userId: number
    name: string
    description?: string
  }): Promise<Stream> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `INSERT INTO streams (user_id, name, description, status)
         VALUES ($1, $2, $3, 'inactive')
         RETURNING id, user_id, name, description, status, created_at, updated_at`,
        [params.userId, params.name, params.description ?? null],
      )
      if (!rows[0]) {
        throw new InternalServerErrorException("Failed to create stream")
      }
      return this.rowToStream(rows[0])
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err
      this.handleDbError(err, "create")
    }
  }

  async update(
    id: number,
    changes: { name?: string; description?: string; status?: string },
  ): Promise<Stream> {
    // Build SET clause dynamically from the provided changes.
    const setClauses: string[] = []
    const params: unknown[] = []

    if (changes.name !== undefined) {
      params.push(changes.name)
      setClauses.push(`name = $${params.length}`)
    }
    if (changes.description !== undefined) {
      params.push(changes.description)
      setClauses.push(`description = $${params.length}`)
    }
    if (changes.status !== undefined) {
      params.push(changes.status)
      setClauses.push(`status = $${params.length}`)
    }

    // Always bump updated_at.
    setClauses.push(`updated_at = NOW()`)

    if (setClauses.length === 1) {
      // Only updated_at changed — nothing useful to do; just return current.
      const stream = await this.findById(id)
      if (!stream) {
        throw new InternalServerErrorException(`stream ${id} not found`)
      }
      return stream
    }

    params.push(id)
    const idParam = `$${params.length}`

    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `UPDATE streams
         SET ${setClauses.join(", ")}
         WHERE id = ${idParam}
         RETURNING id, user_id, name, description, status, created_at, updated_at`,
        params,
      )
      if (!rows[0]) {
        throw new InternalServerErrorException(`stream ${id} not found`)
      }
      return this.rowToStream(rows[0])
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err
      this.handleDbError(err, "update")
    }
  }

  async delete(id: number): Promise<boolean> {
    try {
      const { rowCount } = await this.pool.query(
        `DELETE FROM streams WHERE id = $1`,
        [id],
      )
      return (rowCount ?? 0) > 0
    } catch (err) {
      this.handleDbError(err, "delete")
    }
  }

  async getAnalytics(streamId: number): Promise<StreamAnalyticsDto> {
    try {
      const { rows } = await this.pool.query<{
        last_24h: string
        last_7d: string
        last_30d: string
        error_events_30d: string
        average_latency_ms: number | string | null
        p99_latency_ms: number | string | null
      }>(
        `WITH scoped AS (
           SELECT event_type, created_at, processing_latency_ms
           FROM stream_events
           WHERE stream_id = $1
             AND created_at >= NOW() - INTERVAL '30 days'
         )
         SELECT
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24h,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7d,
           COUNT(*)::int AS last_30d,
           COUNT(*) FILTER (WHERE LOWER(event_type) = 'error')::int AS error_events_30d,
           AVG(processing_latency_ms)::float AS average_latency_ms,
           (percentile_cont(0.99) WITHIN GROUP (ORDER BY processing_latency_ms)
             FILTER (WHERE processing_latency_ms IS NOT NULL))::float AS p99_latency_ms
         FROM scoped`,
        [streamId],
      )

      const { rows: seriesRows } = await this.pool.query<{
        minute: Date
        count: string | number
      }>(
        `WITH buckets AS (
           SELECT generate_series(
             date_trunc('minute', NOW()) - INTERVAL '59 minutes',
             date_trunc('minute', NOW()),
             INTERVAL '1 minute'
           ) AS minute
         )
         SELECT buckets.minute,
                COUNT(stream_events.id)::int AS count
         FROM buckets
         LEFT JOIN stream_events
           ON stream_events.stream_id = $1
          AND stream_events.created_at >= buckets.minute
          AND stream_events.created_at < buckets.minute + INTERVAL '1 minute'
         GROUP BY buckets.minute
         ORDER BY buckets.minute ASC`,
        [streamId],
      )

      const stats = rows[0]
      const last30d = Number(stats?.last_30d ?? 0)
      const errorEvents = Number(stats?.error_events_30d ?? 0)

      return {
        streamId,
        totalEventsProcessed: {
          last24h: Number(stats?.last_24h ?? 0),
          last7d: Number(stats?.last_7d ?? 0),
          last30d,
        },
        errorRate: {
          window: "30d",
          totalEvents: last30d,
          errorEvents,
          percentage: last30d === 0 ? 0 : roundPercent((errorEvents / last30d) * 100),
        },
        processingLatency: {
          window: "30d",
          averageMs: nullableNumber(stats?.average_latency_ms),
          p99Ms: nullableNumber(stats?.p99_latency_ms),
        },
        eventsPerMinute: seriesRows.map((row) => ({
          minute: row.minute.toISOString(),
          count: Number(row.count),
        })),
        generatedAt: new Date().toISOString(),
      }
    } catch (err) {
      this.handleDbError(err, "getAnalytics")
    }
  }
}

function nullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return Number(value)
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100
}
