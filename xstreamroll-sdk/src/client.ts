import { HttpClient, HttpRequestError } from "./http"
import { paginateAll as createIterator, type PaginatedFetcher } from "./pagination"
import {
  ApiError,
  type ApiErrorResponse,
  type AuthTokens,
  type CreateUserDto,
  type CreateWebhookDto,
  type Stream,
  type StreamConfig,
  type StreamEvent,
  type PaginatedResponse,
  type WebhookSubscription,
} from "./types"

/** Named environment presets for base URL resolution. */
export type ClientEnv = "development" | "staging" | "production"

const ENV_URLS: Record<ClientEnv, string> = {
  development: "http://localhost:3001",
  staging: "https://staging-api.xstreamroll.io",
  production: "https://api.xstreamroll.io",
}

export class StreamingClient {
  private apiUrl: string
  private clientId: string
  private apiKey?: string
  private http: HttpClient
  private tokens: AuthTokens | null = null

  constructor(config: StreamConfig) {
    if (config.baseUrl) {
      this.apiUrl = config.baseUrl
    } else if (config.env) {
      this.apiUrl = ENV_URLS[config.env]
    } else {
      this.apiUrl = config.apiUrl ?? ENV_URLS.development
    }
    this.clientId = config.clientId || `client-${Date.now()}`
    this.apiKey = config.apiKey

    // Single HTTP layer: fetch-based HttpClient (with withRetry).
    this.http = new HttpClient(this.apiUrl)

    // Attach Authorization header when tokens are available
    this.http.addRequestInterceptor((cfg) => {
      if (!this.tokens) return cfg
      const headers: Record<string, string> = {
        ...(cfg.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${this.tokens.accessToken}`,
      }
      return { ...cfg, headers }
    })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<AuthTokens> {
    const data = await this.requestJson<AuthTokens>(
      "/auth/login",
      { method: "POST", body: { email, password } },
      { skipAuthRefresh: true },
    )
    this.tokens = data
    return data
  }

  async register(dto: CreateUserDto): Promise<AuthTokens> {
    const data = await this.requestJson<AuthTokens>(
      "/auth/register",
      { method: "POST", body: dto },
      { skipAuthRefresh: true },
    )
    this.tokens = data
    return data
  }

  async logout(): Promise<void> {
    if (this.tokens) {
      await this.requestJson<void>("/auth/logout", { method: "POST" }, { skipAuthRefresh: true }).catch(
        () => {},
      )
    }
    this.tokens = null
  }

  async refreshToken(): Promise<AuthTokens> {
    const data = await this.requestJson<AuthTokens>(
      "/auth/refresh",
      { method: "POST" },
      { skipAuthRefresh: true },
    )
    this.tokens = data
    return data
  }

  // ── Streams ───────────────────────────────────────────────────────────────

  /**
   * Push a single event into the worker queue (issue #514). The API
   * endpoint is `POST /streams/events`, authenticated with the stream API
   * key (`X-Stream-Api-Key` header) rather than a user JWT. The server
   * stamps the arrival timestamp, so the client no longer sends one.
   */
  async publishEvent(event: StreamEvent): Promise<void> {
    try {
      const headers: Record<string, string> = {}
      if (this.apiKey) {
        headers["X-Stream-Api-Key"] = this.apiKey
      }
      await this.requestJson<void>(
        "/streams/events",
        {
          method: "POST",
          body: { streamId: event.streamId, data: event.data },
          headers,
        },
      )
    } catch (error) {
      console.error("Failed to publish event:", error)
      throw error
    }
  }

  async getStreamStatus(streamId: string): Promise<Stream> {
    try {
      return await this.requestJson<Stream>(`/streams/${streamId}`, { method: "GET" })
    } catch (error) {
      console.error("Failed to get stream status:", error)
      throw error
    }
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  /**
   * Registers a webhook subscription for stream lifecycle events.
   *
   * The returned `secret` is only ever present in this response — store it
   * immediately and use it with {@link verifyWebhookSignature} to validate
   * future deliveries.
   */
  async subscribeWebhook(dto: CreateWebhookDto): Promise<WebhookSubscription> {
    return this.requestJson<WebhookSubscription>("/webhooks", {
      method: "POST",
      body: dto,
    })
  }

  // ── Pagination (#390) ─────────────────────────────────────────────────────

  /**
   * Returns an `AsyncIterable<T>` that walks every page of a paginated
   * list endpoint (issue #390). Each item is yielded exactly once,
   * computed from the server's paginated envelope. `hasMore` is derived
   * from `(page - 1) * limit < total`, so this works even on servers
   * that omit the legacy `hasMore` boolean.
   *
   * ```ts
   * for await (const stream of client.paginateAll<Stream>("/streams")) {
   *   console.log(stream.id)
   * }
   * ```
   */
  paginateAll<T>(
    path: string,
    params: { limit?: number; startPage?: number; maxPages?: number } = {},
    signal?: AbortSignal,
  ): AsyncIterable<T> {
    const fetcher: PaginatedFetcher<T> = async (
      { page, limit }: { page: number; limit: number },
      sig?: AbortSignal,
    ): Promise<PaginatedResponse<T>> => {
      const url = `${path}?page=${page}&limit=${limit}`
      const response = sig
        ? await this.http.get(url, { signal: sig })
        : await this.http.get(url)
      if (!response.ok) {
        throw await toApiError(response)
      }
      return await parseJsonBody<PaginatedResponse<T>>(response)
    }
    return createIterator<T>(fetcher, {
      limit: params.limit,
      startPage: params.startPage,
      maxPages: params.maxPages,
      signal,
    })
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Shared JSON request helper used by all StreamingClient methods.
   * Maps non-2xx responses (and exhausted HttpClient retries) to ApiError,
   * and optionally retries once after a token refresh on 401.
   */
  private async requestJson<T>(
    path: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
    options: { skipAuthRefresh?: boolean; retried?: boolean } = {},
  ): Promise<T> {
    try {
      const response =
        init.method === "POST" || init.body !== undefined
          ? await this.http.post(path, init.body, { headers: init.headers })
          : await this.http.get(path, { headers: init.headers })

      if (
        response.status === 401 &&
        !options.retried &&
        !options.skipAuthRefresh &&
        this.tokens?.refreshToken
      ) {
        await this.refreshToken()
        return this.requestJson<T>(path, init, { ...options, retried: true })
      }

      if (!response.ok) {
        throw await toApiError(response)
      }

      return parseJsonBody<T>(response)
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (err instanceof HttpRequestError) {
        if (err.response) {
          throw await toApiError(err.response)
        }
        throw err
      }
      throw err
    }
  }
}

async function parseJsonBody<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

async function toApiError(response: Response): Promise<ApiError> {
  let data: ApiErrorResponse | undefined
  try {
    const text = await response.text()
    if (text) {
      data = JSON.parse(text) as ApiErrorResponse
    }
  } catch {
    // Non-JSON error bodies are fine; fall back to statusText.
  }
  const message =
    typeof data?.message === "string"
      ? data.message
      : Array.isArray(data?.message)
        ? data.message.join(", ")
        : response.statusText || `HTTP ${response.status}`
  return new ApiError(response.status, message, data)
}
