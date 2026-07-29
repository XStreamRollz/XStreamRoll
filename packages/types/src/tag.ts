/**
 * A tag resource, as returned by the API.
 *
 * Mirrors the `tags` table defined in `database/schema.sql` —
 * `createdAt` is the wire string the server actually sends.
 */
export interface Tag {
  id: number
  name: string
  slug: string
  createdAt: string
}
