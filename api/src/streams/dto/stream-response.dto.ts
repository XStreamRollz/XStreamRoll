import type { Stream as SharedStream, Tag as SharedTag } from "@xstreamroll/types"
import { Tag } from "../../tags/tag.entity"
import { Stream } from "../stream.entity"

/**
 * Maps the internal, DB-shaped {@link Tag} entity to the public API
 * response contract defined in `@xstreamroll/types#Tag`. `id` is
 * serialised to a string so the wire contract stays independent of
 * the Postgres column type, and `createdAt` is emitted as an ISO
 * timestamp string.
 *
 * See `dto/stream-response.dto.ts` for the corresponding `Stream`
 * mapper.
 */
export function toTagResponse(tag: Tag): SharedTag {
  return {
    id: String(tag.id),
    name: tag.name,
    slug: tag.slug,
    createdAt: tag.createdAt.toISOString(),
  }
}

/**
 * Maps the internal, DB-shaped {@link Stream} entity to the public API
 * response contract defined in `@xstreamroll/types#Stream`. `id` and
 * `userId` are serialized to strings here — the one place this needs
 * to happen — so the wire contract stays independent of the Postgres
 * column type.
 *
 * `tags` is included on the wire so a single `GET /streams`
 * round-trip carries everything the dashboard needs to render tag
 * chips (issue #330). When the caller has not populated `tags`
 * (create / update / findOne) we emit an empty array so the field is
 * stable across endpoints.
 */
export function toStreamResponse(stream: Stream): SharedStream {
  return {
    id: String(stream.id),
    userId: String(stream.userId),
    name: stream.name,
    description: stream.description,
    status: stream.status,
    createdAt: stream.createdAt.toISOString(),
    updatedAt: stream.updatedAt.toISOString(),
    tags: (stream.tags ?? []).map(toTagResponse),
  }
}
