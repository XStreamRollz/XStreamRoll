import type { StreamStatus } from "@xstreamroll/types"
import type { Tag } from "../tags/tag.entity"

/**
 * In-memory representation of a stream. Mirrors the `streams` table
 * defined in `database/schema.sql`. The controller and service layers
 * depend on this interface so they stay unchanged when the repository
 * is swapped for a real DB-backed implementation.
 *
 * `id` and `userId` are numeric here because that's what the `SERIAL`
 * primary key actually is in Postgres. They're serialized to strings
 * at the API boundary — see `dto/stream-response.dto.ts` — so the
 * public contract matches `@xstreamroll/types#Stream` without forcing
 * every internal consumer (guards, repositories, SQL params) to work
 * with stringly-typed ids.
 *
 * `tags` is populated inline by {@link StreamsService.list} so a
 * single `GET /streams` round-trip carries everything the dashboard
 * needs to render tag chips (issue #330). Endpoints that fetch a
 * single stream (create / update / findOne) leave the field undefined;
 * callers that want the tags there should hit `GET /streams/:id/tags`.
 */
export interface Stream {
  id: number
  userId: number
  name: string
  description: string | null
  status: StreamStatus
  createdAt: Date
  updatedAt: Date
  /** See StreamsService.list for how this is populated. */
  tags?: Tag[]
}
