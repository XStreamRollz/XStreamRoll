import type { Tag } from "./tag"

/** Possible lifecycle states of a stream. */
export type StreamStatus = "active" | "inactive" | "error"

/**
 * Visibility of a stream on the discovery / listing surface (issue #393).
 *
 * - `"private"` (default): only the owner may list the stream and its
 *   events. Owner checks are already enforced by
 *   `StreamOwnershipGuard` on individual read endpoints — the visibility
 *   flag primarily affects the list endpoint and any future discovery
 *   surface.
 * - `"public"`: the stream is listable to authenticated users via the
 *   `visibility` filter on `GET /streams`. Single-stream read endpoints
 *   remain owner-only.
 *
 * The default of `"private"` is intentionally conservative: flipping a
 * stream to `"public"` is the only direction callers need to be
 * deliberate about.
 */
export type StreamVisibility = "public" | "private"

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
  /** Defaults to `"private"` for newly-created streams (issue #393). */
  visibility: StreamVisibility
  createdAt: string
  updatedAt: string
  /**
   * Tags attached to this stream. Populated inline on the list
   * endpoint so a single `GET /streams` round-trip returns the
   * caller everything it needs to render tag chips (issue #330).
   * May be `undefined` on endpoints that fetch a single stream
   * directly (create / update / findOne) — callers that want the
   * tags should hit `GET /streams/:id/tags`.
   */
  tags?: Tag[]
}

/** Payload accepted by `POST /streams`. */
export interface CreateStreamDto {
  name: string
  description?: string
  /** Defaults to `"private"` when omitted (issue #393). */
  visibility?: StreamVisibility
}

/** Payload accepted by `PATCH /streams/:id`. */
export interface UpdateStreamDto {
  name?: string
  description?: string
  status?: StreamStatus
  /** Optional visibility flip (issue #393). */
  visibility?: StreamVisibility
}
