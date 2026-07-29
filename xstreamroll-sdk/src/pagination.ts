/**
 * Async-iterator helper for paginated list endpoints (#390).
 *
 * The server returns a `PaginatedResponse<T>` envelope:
 *
 *   { data: T[], total: number, page: number, limit: number }
 *
 * Most SDK consumers want the *flattened* list of items. Hand-driving
 * the cursor — incrementing `page` each round-trip — is fiddly and
 * easy to under-test. This module turns any paginated endpoint into an
 * `AsyncIterable<T>` that yields each item once across the entire
 * result set.
 *
 * Termination condition: when `page * limit >= total`, we stop. This
 * works even on endpoints that omit the legacy `hasMore` boolean, and
 * it tolerates the rare off-by-one when the server returns a final
 * partial page.
 *
 * Network/runtime errors from the underlying fetcher are propagated
 * unchanged — the for-await loop should be wrapped in try/catch by
 * the caller, exactly as for any other HTTP failure.
 */

import type { PaginatedResponse } from "@xstreamroll/types"

/**
 * A pluggable fetcher returns the next page given a `{ page, limit }`
 * pair. The `paginateAll` helper is transport-agnostic: tests can
 * inject an in-memory fetcher; production uses `HttpClient`.
 */
export type PaginatedFetcher<T> = (
  params: { page: number; limit: number },
  signal?: AbortSignal,
) => Promise<PaginatedResponse<T>>

export interface PaginateAllOptions {
  /** Page size passed to the fetcher. Defaults to 50. */
  limit?: number
  /**
   * Starting page (1-indexed). Defaults to 1.
   *
   * Useful for resuming after an interruption: pass the page returned
   * by the previous call's `.returnCursor()` if you persisted it.
   */
  startPage?: number
  /** Hard ceiling on the number of pages fetched. Defaults to 1000. */
  maxPages?: number
  /** Optional AbortSignal that cancels the iteration immediately. */
  signal?: AbortSignal
}

/**
 * Internal state for the async iterator protocol. Yielded to callers
 * out of band via `cursor` so the iteration can break early without
 * losing the resume page.
 */
export class PaginatedIterator<T> implements AsyncIterable<T> {
  private readonly fetcher: PaginatedFetcher<T>
  private readonly limit: number
  private readonly maxPages: number
  private signal: AbortSignal | undefined
  private page: number
  private offset = 0 // index inside the current page
  private currentPage: T[] = []
  private exhausted = false
  private total: number | undefined

  constructor(fetcher: PaginatedFetcher<T>, options: PaginateAllOptions = {}) {
    this.fetcher = fetcher
    this.limit = Math.max(1, options.limit ?? 50)
    this.maxPages = Math.max(1, options.maxPages ?? 1000)
    this.page = Math.max(1, options.startPage ?? 1)
    this.signal = options.signal
  }

  /**
   * The next `page` that *will* be requested on the next round-trip,
   * or `null` when the iteration is exhausted. Useful for callers
   * that want to persist a resume cursor across runs.
   */
  get cursor(): number | null {
    if (this.exhausted) return null
    if (this.offset < this.currentPage.length) return this.page
    return this.page
  }

  [Symbol.asyncIterator](): AsyncIterator<T, void, undefined> {
    return this
  }

  async next(): Promise<IteratorResult<T, void>> {
    if (this.signal?.aborted) {
      this.exhausted = true
      return { value: undefined, done: true }
    }
    while (this.offset >= this.currentPage.length) {
      if (this.exhausted) return { value: undefined, done: true }
      if (
        this.total !== undefined &&
        (this.page - 1) * this.limit >= this.total
      ) {
        this.exhausted = true
        return { value: undefined, done: true }
      }
      if (this.page > this.maxPages) {
        this.exhausted = true
        return { value: undefined, done: true }
      }
      const response = await this.fetcher(
        { page: this.page, limit: this.limit },
        this.signal,
      )
      this.currentPage = response.data ?? []
      this.total = response.total ?? this.currentPage.length
      // Always advance past pages that returned nothing — otherwise a
      // degenerate "all empty pages until total pages reached" server
      // response would loop forever.
      this.page += 1
      this.offset = 0
      // Break out if we just learned that no more pages exist.
      if (this.currentPage.length === 0) {
        this.exhausted = true
        return { value: undefined, done: true }
      }
    }
    const item = this.currentPage[this.offset]
    this.offset += 1
    if (item === undefined) {
      // TypeScript: defensive guard — we just checked bounds above
      // but Array#length can change between iterations only via a
      // subclass, which we don't expose.
      return { value: undefined, done: true }
    }
    return { value: item, done: false }
  }

  /**
   * Materialize the iteration into a plain array. The async-iterator
   * protocol pairs naturally with `.toArray()` — same shape as
   * `Array.from(asyncIterable)`.
   */
  async toArray(): Promise<T[]> {
    const out: T[] = []
    for await (const item of this) {
      out.push(item)
    }
    return out
  }
}

/**
 * Walk every page of a `PaginatedResponse<T>` endpoint and yield
 * each item exactly once. Returns the `{ value: item, done: … }`
 * async-iterator pair used by `for await … of`.
 *
 * Use this when you have direct access to a fetcher. For
 * `StreamingClient` consumers, the `client.paginateAll(path)` wrapper
 * plugs `HttpClient` into this helper.
 */
export function paginateAll<T>(
  fetcher: PaginatedFetcher<T>,
  options: PaginateAllOptions = {},
): PaginatedIterator<T> {
  return new PaginatedIterator<T>(fetcher, options)
}
