import axios, { type AxiosInstance } from "axios"
import type { StreamEvent, StreamConfig, AuthTokens, CreateUserDto } from "./types"

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
  private http: AxiosInstance
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

    this.http = axios.create({ baseURL: this.apiUrl })

    // Attach Authorization header when tokens are available
    this.http.interceptors.request.use((req) => {
      if (this.tokens) {
        req.headers.Authorization = `Bearer ${this.tokens.accessToken}`
      }
      return req
    })

    // Auto-refresh on 401
    this.http.interceptors.response.use(
      (res) => res,
      async (error) => {
        const original = error.config
        if (error.response?.status === 401 && !original._retry && this.tokens?.refreshToken) {
          original._retry = true
          await this.refreshToken()
          original.headers.Authorization = `Bearer ${this.tokens!.accessToken}`
          return this.http(original)
        }
        return Promise.reject(error)
      }
    )
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<AuthTokens> {
    const { data } = await this.http.post<AuthTokens>("/auth/login", { email, password })
    this.tokens = data
    return data
  }

  async register(dto: CreateUserDto): Promise<AuthTokens> {
    const { data } = await this.http.post<AuthTokens>("/auth/register", dto)
    this.tokens = data
    return data
  }

  async logout(): Promise<void> {
    if (this.tokens) {
      await this.http.post("/auth/logout").catch(() => {})
    }
    this.tokens = null
  }

  async refreshToken(): Promise<AuthTokens> {
    const { data } = await this.http.post<AuthTokens>("/auth/refresh", {
      refreshToken: this.tokens?.refreshToken,
    })
    this.tokens = data
    return data
  }

  // ── Streams ───────────────────────────────────────────────────────────────

  async publishEvent(event: StreamEvent): Promise<void> {
    try {
      await this.http.post("/streams/events", {
        clientId: this.clientId,
        ...event,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error("Failed to publish event:", error)
      throw error
    }
  }

  async getStreamStatus(streamId: string): Promise<any> {
    try {
      const response = await this.http.get(`/streams/${streamId}`)
      return response.data
    } catch (error) {
      console.error("Failed to get stream status:", error)
      throw error
    }
  }
}
