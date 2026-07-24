/**
 * A tag resource, as returned by the API.
 *
 * Mirrors the `tags` table defined in `database/schema.sql` —
 * `createdAt` is the wire string the server actually sends.
 */
/**
 * A tag resource, as returned by the API.
 *
 * Mirrors the `tags` table defined in `database/schema.sql` —
 * `createdAt` is the wire string the server actually sends.
 *
 * Unlike {@link Stream.id}, tag IDs are SERIAL (numeric) on the wire
 * because all tag endpoints use `ParseIntPipe` — see #376 note on
 * String-id serialisation for streams vs numeric ids for tags.
 */
export interface Tag {
  id: number
  name: string
  slug: string
  createdAt: string
}
