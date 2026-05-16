/**
 * Centralised tag + TTL constants used by the Next.js server-side
 * cache (unstable_cache). Keeping these in one file makes it easy to
 * audit every cache entry and pick consistent tag names that
 * mutation helpers can target via revalidateTag().
 */

export const CACHE_TAGS = {
  streamList: "stream-list",
  streamDetail: "stream-detail",
  tagsList: "tags-list",
} as const

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS]

export const CACHE_TTL_SECONDS = {
  /** Stream listing — refreshes at most once every 30s per acceptance criteria. */
  streamList: 30,
  /** Individual stream detail — slightly longer because per-stream mutations explicitly bust the tag. */
  streamDetail: 60,
  /** Tag catalogue — rarely changes. */
  tagsList: 300,
} as const

export function streamDetailTag(streamId: string | number): string {
  return `${CACHE_TAGS.streamDetail}:${String(streamId)}`
}
