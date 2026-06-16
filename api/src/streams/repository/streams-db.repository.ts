import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common"
import { Pool } from "pg"
import { env } from "../../config/env"
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
  private readonly pool: Pool
  private readonly logger = new Logger(StreamsDbRepository.name)

  constructor() {
    this.pool = new Pool({ connectionString: env.DATABASE_URL })

    this.pool.on("error", (err) => {
      this.logger.error("Unexpected PostgreSQL pool error", err.stack)
    })
  }

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
}
