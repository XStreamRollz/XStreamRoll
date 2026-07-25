import type { Stream as SharedStream } from "@xstreamroll/types"
import { Stream } from "../stream.entity"

/**
 * Maps the internal, DB-shaped {@link Stream} entity to the public API
 * response contract defined in `@xstreamroll/types`. `id` and `userId`
 * are serialized to strings here — the one place this needs to happen —
 * so the wire contract stays independent of the Postgres column type.
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
  }
}
