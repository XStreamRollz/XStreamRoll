import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common"
import { Pool } from "pg"
import { PG_POOL } from "../../database/database.module"
import { StreamTag, Tag } from "../tag.entity"

/**
 * PostgreSQL-backed tags repository.
 *
 * Implements the same public API as {@link TagsRepository} so the
 * service and controller layers are unaffected by the swap.
 *
 * All queries use parameterized placeholders ($1, $2 …) — never string
 * interpolation — to prevent SQL injection.
 */
@Injectable()
export class TagsDbRepository {
  private readonly logger = new Logger(TagsDbRepository.name)

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Map a raw DB row to the Tag entity shape. */
  private rowToTag(row: Record<string, unknown>): Tag {
    return {
      id: row.id as number,
      name: row.name as string,
      slug: row.slug as string,
      createdAt: row.created_at as Date,
    }
  }

  /** Wrap pg errors in a NestJS-friendly exception. */
  private handleDbError(err: unknown, context: string): never {
    this.logger.error(`DB error in ${context}`, (err as Error).stack)
    throw new ServiceUnavailableException(
      "Database is unavailable. Please try again later.",
    )
  }

  async findBySlug(slug: string): Promise<Tag | undefined> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT id, name, slug, created_at FROM tags WHERE slug = $1`,
        [slug],
      )
      return rows[0] ? this.rowToTag(rows[0]) : undefined
    } catch (err) {
      this.handleDbError(err, "findBySlug")
    }
  }

  async findById(id: number): Promise<Tag | undefined> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT id, name, slug, created_at FROM tags WHERE id = $1`,
        [id],
      )
      return rows[0] ? this.rowToTag(rows[0]) : undefined
    } catch (err) {
      this.handleDbError(err, "findById")
    }
  }

  /**
   * Idempotent upsert: inserts a new tag or returns the existing one if
   * a tag with the same slug already exists. Matches the unique-on-slug
   * constraint in the database schema.
   */
  async upsertBySlug(name: string, slug: string): Promise<Tag> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `INSERT INTO tags (name, slug)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name
         RETURNING id, name, slug, created_at`,
        [name, slug],
      )
      if (!rows[0]) {
        throw new InternalServerErrorException("Failed to upsert tag")
      }
      return this.rowToTag(rows[0])
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err
      this.handleDbError(err, "upsertBySlug")
    }
  }

  /**
   * Returns a stable, alphabetically-sorted (by slug) page of tags plus
   * a total count for the pagination envelope.
   */
  async listPaginated(
    page: number,
    limit: number,
  ): Promise<{ items: Tag[]; total: number }> {
    const offset = (page - 1) * limit

    try {
      const { rows: countRows } = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM tags`,
      )
      const total = Number(countRows[0]?.count ?? 0)

      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT id, name, slug, created_at
         FROM tags
         ORDER BY slug ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      )

      return { items: rows.map((r) => this.rowToTag(r)), total }
    } catch (err) {
      this.handleDbError(err, "listPaginated")
    }
  }

  /**
   * Attach a tag to a stream. Idempotent — a duplicate attach is silently
   * ignored via ON CONFLICT DO NOTHING (matches the composite PK on
   * stream_tags).
   */
  async attachToStream(streamId: number, tagId: number): Promise<StreamTag> {
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `INSERT INTO stream_tags (stream_id, tag_id)
         VALUES ($1, $2)
         ON CONFLICT (stream_id, tag_id) DO NOTHING
         RETURNING stream_id, tag_id, created_at`,
        [streamId, tagId],
      )

      // If the row already existed DO NOTHING returns nothing, so we
      // fetch the existing association.
      if (!rows[0]) {
        const { rows: existing } = await this.pool.query<
          Record<string, unknown>
        >(
          `SELECT stream_id, tag_id, created_at
           FROM stream_tags
           WHERE stream_id = $1 AND tag_id = $2`,
          [streamId, tagId],
        )
        return {
          streamId: existing[0].stream_id as number,
          tagId: existing[0].tag_id as number,
          createdAt: existing[0].created_at as Date,
        }
      }

      return {
        streamId: rows[0].stream_id as number,
        tagId: rows[0].tag_id as number,
        createdAt: rows[0].created_at as Date,
      }
    } catch (err) {
      this.handleDbError(err, "attachToStream")
    }
  }

  async detachFromStream(streamId: number, tagId: number): Promise<boolean> {
    try {
      const { rowCount } = await this.pool.query(
        `DELETE FROM stream_tags WHERE stream_id = $1 AND tag_id = $2`,
        [streamId, tagId],
      )
      return (rowCount ?? 0) > 0
    } catch (err) {
      this.handleDbError(err, "detachFromStream")
    }
  }

  async isAttached(streamId: number, tagId: number): Promise<boolean> {
    try {
      const { rows } = await this.pool.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM stream_tags
           WHERE stream_id = $1 AND tag_id = $2
         ) AS exists`,
        [streamId, tagId],
      )
      return rows[0]?.exists ?? false
    } catch (err) {
      this.handleDbError(err, "isAttached")
    }
  }

  /**
   * Batch-load tags grouped by stream id in a single SQL roundtrip.
   * Every requested stream id appears as a key — possibly with an
   * empty array — so the caller can rely on `map.get(id)` returning
   * `[]` instead of `undefined` for streams that have no tags
   * attached. Tags are sorted by `(stream_id ASC, slug ASC)` so the
   * wire order is stable per stream.
   *
   * Used by {@link StreamsService.list} to eliminate the N+1 query
   * where the dashboard previously fetched tags per stream in a loop
   * (issue #330). The query plan uses the composite primary key
   * `(stream_id, tag_id)` on `stream_tags`.
   */
  async listForStreamIds(
    streamIds: number[],
  ): Promise<Map<number, Tag[]>> {
    if (streamIds.length === 0) return new Map()
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT st.stream_id, t.id, t.name, t.slug, t.created_at
         FROM stream_tags st
         JOIN tags t ON t.id = st.tag_id
         WHERE st.stream_id = ANY($1::int[])
         ORDER BY st.stream_id ASC, t.slug ASC`,
        [streamIds],
      )
      const result = new Map<number, Tag[]>()
      for (const id of streamIds) result.set(id, [])
      for (const row of rows) {
        const streamId = row.stream_id as number
        result.get(streamId)?.push(this.rowToTag(row))
      }
      return result
    } catch (err) {
      this.handleDbError(err, "listForStreamIds")
    }
  }
}
