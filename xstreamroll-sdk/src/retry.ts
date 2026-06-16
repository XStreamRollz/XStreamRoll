/**
 * Retry helper for transient HTTP failures.
 *
 * Used by the SDK's HttpClient to wrap fetch() in an exponential-backoff
 * loop. The helper is intentionally generic (no HTTP types) so it can
 * be reused by background jobs in tests or workers.
 *
 * Defaults follow the AWS SDK guidance for web retries:
 *   - 3 attempts,
 *   - base delay 200ms,
 *   - max delay 5s,
 *   - 100ms jitter,
 *   - retry only on retryable status codes (408, 425, 429, 5xx) and
 *     network errors. 4xx other than 408/425/429 are not retried.
 */

export interface RetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  jitterMs?: number
  /** Predicate that decides whether an error is worth retrying. */
  shouldRetry?: (err: unknown, attempt: number) => boolean
  /** Sleep function — injectable for tests. */
  sleep?: (ms: number) => Promise<void>
  /** Called before each retry with the upcoming attempt number. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void
}

const DEFAULT_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

/**
 * Default predicate: retry on network errors (TypeError thrown by
 * fetch) and on the well-known transient HTTP statuses.
 */
export function defaultShouldRetry(err: unknown): boolean {
  if (err instanceof TypeError) return true // fetch network errors
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: number }).status
    if (typeof status === "number" && DEFAULT_RETRY_STATUSES.has(status)) {
      return true
    }
  }
  return false
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run `fn` until it resolves or the retry budget is exhausted.
 * Re-throws the last error on failure.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3)
  const baseDelay = Math.max(0, options.baseDelayMs ?? 200)
  const maxDelay = Math.max(baseDelay, options.maxDelayMs ?? 5_000)
  const jitter = Math.max(0, options.jitterMs ?? 100)
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry
  const sleep = options.sleep ?? defaultSleep

  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastErr = err
      if (attempt >= maxAttempts || !shouldRetry(err, attempt)) {
        throw err
      }
      const expo = baseDelay * 2 ** (attempt - 1)
      const delay = Math.min(maxDelay, expo) + Math.floor(Math.random() * jitter)
      options.onRetry?.(err, attempt, delay)
      await sleep(delay)
    }
  }
  // Unreachable: the loop either returns or throws.
  throw lastErr
}
