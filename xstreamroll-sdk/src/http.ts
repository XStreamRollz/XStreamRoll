/** A function that transforms a request config before it is sent. */
export type RequestInterceptor = (
  config: RequestInit & { url: string }
) => RequestInit & { url: string }

/** A function that transforms a response after it is received. */
export type ResponseInterceptor = (response: Response) => Response | Promise<Response>

/** Opaque handle returned when registering an interceptor. */
export type InterceptorHandle = number

import { withRetry, type RetryOptions } from "./retry"

/** Options that control retry behaviour for a single HttpClient. */
export interface HttpClientRetryOptions extends RetryOptions {
  /** Set to false to disable retries entirely. Defaults to true. */
  enabled?: boolean
}

/**
 * Thrown by HttpClient when a request ultimately fails after the
 * retry budget is exhausted. Carries the last response (or undefined
 * for network errors) so callers can inspect status / headers.
 */
export class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly response?: Response,
    public readonly attempts: number = 1,
  ) {
    super(message)
    this.name = "HttpRequestError"
  }
}

/**
 * Lightweight interceptor chain for the SDK HTTP layer.
 *
 * Usage:
 *   const http = new HttpClient("https://api.xstreamroll.io")
 *   const handle = http.addRequestInterceptor(cfg => {
 *     return { ...cfg, headers: { ...cfg.headers, Authorization: `Bearer ${token}` } }
 *   })
 *   http.removeInterceptor(handle)
 */
export class HttpClient {
  private readonly baseUrl: string
  private nextId = 0
  private readonly requestInterceptors = new Map<InterceptorHandle, RequestInterceptor>()
  private readonly responseInterceptors = new Map<InterceptorHandle, ResponseInterceptor>()
  private readonly retryOptions: HttpClientRetryOptions

  constructor(baseUrl: string, retryOptions: HttpClientRetryOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "")
    this.retryOptions = { enabled: true, ...retryOptions }
  }

  addRequestInterceptor(fn: RequestInterceptor): InterceptorHandle {
    const id = this.nextId++
    this.requestInterceptors.set(id, fn)
    return id
  }

  addResponseInterceptor(fn: ResponseInterceptor): InterceptorHandle {
    const id = this.nextId++
    this.responseInterceptors.set(id, fn)
    return id
  }

  removeInterceptor(handle: InterceptorHandle): void {
    this.requestInterceptors.delete(handle)
    this.responseInterceptors.delete(handle)
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    let config: RequestInit & { url: string } = { ...init, url: `${this.baseUrl}${path}` }

    for (const fn of this.requestInterceptors.values()) {
      config = fn(config)
    }

    const { url, ...fetchInit } = config

    const send = async (): Promise<Response> => {
      let response = await fetch(url, fetchInit)
      for (const fn of this.responseInterceptors.values()) {
        response = await fn(response)
      }
      if (!response.ok && shouldRetryStatus(response.status)) {
        // Throw an error tagged with the status so the retry helper
        // can decide whether the response is worth retrying. The
        // response is attached for inspection in the eventual
        // HttpRequestError.
        const err = new HttpRequestError(
          `HTTP ${response.status} ${response.statusText}`,
          undefined,
          response.clone(),
          1,
        )
        ;(err as { status?: number }).status = response.status
        throw err
      }
      return response
    }

    if (this.retryOptions.enabled === false) {
      return send()
    }

    try {
      return await withRetry(send, this.retryOptions)
    } catch (err) {
      if (err instanceof HttpRequestError) throw err
      throw new HttpRequestError(
        err instanceof Error ? err.message : String(err),
        err,
        undefined,
        this.retryOptions.maxAttempts ?? 3,
      )
    }
  }
}

const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

function shouldRetryStatus(status: number): boolean {
  return RETRY_STATUSES.has(status)
}
