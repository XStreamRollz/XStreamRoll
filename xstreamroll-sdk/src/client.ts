import { HttpClient, HttpRequestError } from "./http"
import {
  ApiError,
  type StreamEvent,
  type StreamConfig,
  type Stream,
  type StreamEventRecord,
  type AuthTokens,
  type CreateUserDto,
  type ApiErrorResponse,
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
      { method: "POST", body: { refreshToken: this.tokens?.refreshToken } },
      { skipAuthRefresh: true },
    )
    this.tokens = data
    return data
  }

  // ── Streams ───────────────────────────────────────────────────────────────

  async publishEvent(event: StreamEvent): Promise<void> {
    try {
      await this.requestJson<void>("/streams/events", {
        method: "POST",
        body: {
          clientId: this.clientId,
          ...event,
          timestamp: new Date().toISOString(),
        },
      })
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

  /**
   * Retrieve historical events for a stream (event replay).
   *
   * @param streamId - The stream to fetch events for.
   * @param params   - Optional filtering and pagination parameters.
   */
  async getStreamEvents(
    streamId: string,
    params?: {
      since?: string
      limit?: number
      cursor?: number
    },
  ): Promise<{ events: StreamEventRecord[]; nextCursor: string | null }> {
    const searchParams = new URLSearchParams()
    if (params?.since) searchParams.set("since", params.since)
    if (params?.limit) searchParams.set("limit", String(params.limit))
    if (params?.cursor) searchParams.set("cursor", String(params.cursor))

    const qs = searchParams.toString()
    const path = qs ? `/streams/${streamId}/events?${qs}` : `/streams/${streamId}/events`

    return this.requestJson(path, { method: "GET" })
  }

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
