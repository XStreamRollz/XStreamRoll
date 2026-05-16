import { unstable_cache } from "next/cache"

/**
 * `unstable_cache` wrapper that adds two affordances:
 *
 *   1. Dev-mode hit/miss logging. The Next.js cache surface does not
 *      expose hit/miss directly, so we record the first time a key is
 *      computed and emit a `[cache hit]` / `[cache miss]` line via
 *      console — visible in the server logs and the Next.js dev tools
 *      panel. The logger is a no-op in production builds.
 *
 *   2. Strict typing of the tag array.
 *
 *   const getStreams = cached(
 *     async (userId: string) => fetchStreamsFor(userId),
 *     ["streams", "by-user"],
 *     { tags: [CACHE_TAGS.streamList], revalidate: 30 },
 *   )
 *
 * The `keyParts` argument is forwarded verbatim to `unstable_cache`
 * so the cache key remains a function of the runtime arguments.
 */
const seenKeys = new Set<string>()
const isDev = process.env.NODE_ENV !== "production"

export interface CachedOptions {
  tags: string[]
  /** Time-to-live in seconds. Pass `false` to disable time-based revalidation. */
  revalidate: number | false
  /** Human-readable label used in the dev hit/miss log line. */
  label?: string
}

export function cached<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyParts: string[],
  options: CachedOptions,
): (...args: TArgs) => Promise<TResult> {
  const wrapped = unstable_cache(
    async (...args: TArgs) => {
      const key = `${options.label ?? keyParts.join(":")}::${JSON.stringify(args)}`
      const isMiss = !seenKeys.has(key)
      if (isDev) {
        // Single-line log so the dev tools panel shows it cleanly.
        console.log(`[cache ${isMiss ? "miss" : "miss-or-stale"}] ${key}`)
        seenKeys.add(key)
      }
      return fn(...args)
    },
    keyParts,
    {
      tags: options.tags,
      revalidate: options.revalidate,
    },
  )

  return async (...args: TArgs) => {
    if (isDev) {
      const key = `${options.label ?? keyParts.join(":")}::${JSON.stringify(args)}`
      if (seenKeys.has(key)) {
        console.log(`[cache hit?] ${key}`)
      }
    }
    return wrapped(...args)
  }
}
