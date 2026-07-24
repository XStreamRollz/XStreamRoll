import type { Tag } from "./tag"

/** Possible lifecycle states of a stream. */
export type StreamStatus = "active" | "inactive" | "error"

/**
 * A stream resource, as returned by the API.
 *
 * `id` and `userId` are strings on the wire for the same reason as
 * {@link User.id} — see the comment there.
 */
export interface Stream {
  id: string
  userId: string
  name: string
  description: string | null
  status: StreamStatus
  createdAt: string
  updatedAt: string
  /**
   * Tags attached to this stream. Populated inline on the list
   * endpoint so a single `GET /streams` round-trip returns the
   * caller everything it needs to render tag chips.
   */
  tags?: Tag[]
}

/** Payload accepted by `POST /streams`. */
export interface CreateStreamDto {
  name: string
  description?: string
}

/** Payload accepted by `PATCH /streams/:id`. */
export interface UpdateStreamDto {
  name?: string
  description?: string
  status?: StreamStatus
}
