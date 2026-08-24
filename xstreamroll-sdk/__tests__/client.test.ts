import axios from "axios"
import { StreamingClient } from "../src/client"
import type { AuthResponse } from "../src/types"

jest.mock("axios")
const mockedAxios = axios as jest.Mocked<typeof axios>

// Helper to read the private apiUrl field for test assertions.
function getApiUrl(client: StreamingClient): string {
  return (client as unknown as { apiUrl: string }).apiUrl
}

// Helper to access the private tokens field.
function getTokens(client: StreamingClient): AuthResponse | null {
  return (client as unknown as { tokens: AuthResponse | null }).tokens
}

function setTokens(client: StreamingClient, tokens: AuthResponse): void {
  ;(client as unknown as { tokens: AuthResponse }).tokens = tokens
}

// Create a mock axios instance with interceptors and post/get methods.
// Axios instances are callable functions with properties.
function mockAxiosInstance() {
  const fn = jest.fn()
  const instance = Object.assign(fn, {
    get: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })
  return instance
}

function mockAuthResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    user: {
      id: "1",
      email: "test@example.com",
      displayName: "Test User",
      role: "viewer",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    accessToken: "access.token.here",
    refreshToken: "refresh.token.here",
    ...overrides,
  }
}

// ── Env Preset Tests ────────────────────────────────────────────────────────

describe("StreamingClient env presets", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedAxios.create.mockReturnValue(mockAxiosInstance() as never)
  })

  it("defaults to development URL when no config given", () => {
    const client = new StreamingClient({})
    expect(getApiUrl(client)).toBe("http://localhost:3001")
  })

  it("resolves production preset", () => {
    const client = new StreamingClient({ env: "production" })
    expect(getApiUrl(client)).toBe("https://api.xstreamroll.io")
  })

  it("resolves staging preset", () => {
    const client = new StreamingClient({ env: "staging" })
    expect(getApiUrl(client)).toBe("https://staging-api.xstreamroll.io")
  })

  it("resolves development preset explicitly", () => {
    const client = new StreamingClient({ env: "development" })
    expect(getApiUrl(client)).toBe("http://localhost:3001")
  })

  it("custom baseUrl overrides env preset", () => {
    const client = new StreamingClient({
      env: "production",
      baseUrl: "https://custom.example.com",
    })
    expect(getApiUrl(client)).toBe("https://custom.example.com")
  })

  it("legacy apiUrl still works", () => {
    const client = new StreamingClient({ apiUrl: "http://legacy:9000" })
    expect(getApiUrl(client)).toBe("http://legacy:9000")
  })

  it("uses HttpClient internally (not axios)", () => {
    const client = new StreamingClient({ baseUrl: "http://api.test" })
    const http = (
      client as unknown as { http: { constructor: { name: string } } }
    ).http
    expect(http.constructor.name).toBe("HttpClient")
  })
})

// ── Auth Tests ──────────────────────────────────────────────────────────────

describe("StreamingClient auth", () => {
  let httpInstance: ReturnType<typeof mockAxiosInstance>

  beforeEach(() => {
    jest.clearAllMocks()
    httpInstance = mockAxiosInstance()
    mockedAxios.create.mockReturnValue(httpInstance as never)
  })

  // -- login -------------------------------------------------------------

  describe("login", () => {
    it("returns AuthResponse with user, accessToken, and refreshToken", async () => {
      const authResp = mockAuthResponse()
      httpInstance.post.mockResolvedValue({ data: authResp })

      const client = new StreamingClient({})
      const result = await client.login("alice@example.com", "password")

      expect(httpInstance.post).toHaveBeenCalledWith("/auth/login", {
        email: "alice@example.com",
        password: "password",
      })
      expect(result).toEqual(authResp)
      expect(result.user).toBeDefined()
      expect(result.user.email).toBe("test@example.com")
      expect(result.accessToken).toBe("access.token.here")
      expect(result.refreshToken).toBe("refresh.token.here")
    })

    it("stores tokens on the instance after login", async () => {
      const authResp = mockAuthResponse()
      httpInstance.post.mockResolvedValue({ data: authResp })

      const client = new StreamingClient({})
      await client.login("alice@example.com", "password")

      expect(getTokens(client)).toEqual(authResp)
    })

    it("does not include expiresIn in the response shape", async () => {
      const authResp = mockAuthResponse()
      httpInstance.post.mockResolvedValue({ data: authResp })

      const client = new StreamingClient({})
      const result = await client.login("alice@example.com", "password")

      expect((result as unknown as Record<string, unknown>).expiresIn).toBeUndefined()
    })
  })

  // -- register ----------------------------------------------------------

  describe("register", () => {
    it("returns AuthResponse with user, accessToken, and refreshToken", async () => {
      const authResp = mockAuthResponse()
      httpInstance.post.mockResolvedValue({ data: authResp })

      const client = new StreamingClient({})
      const dto = {
        email: "new@example.com",
        password: "password",
        displayName: "New User",
      }
      const result = await client.register(dto)

      expect(httpInstance.post).toHaveBeenCalledWith("/auth/register", dto)
      expect(result).toEqual(authResp)
      expect(result.user).toBeDefined()
      expect(result.accessToken).toBe("access.token.here")
      expect(result.refreshToken).toBe("refresh.token.here")
    })

    it("stores tokens on the instance after register", async () => {
      const authResp = mockAuthResponse()
      httpInstance.post.mockResolvedValue({ data: authResp })

      const client = new StreamingClient({})
      await client.register({
        email: "new@example.com",
        password: "password",
        displayName: "New User",
      })

      expect(getTokens(client)).toEqual(authResp)
    })
  })

  // -- refreshToken ------------------------------------------------------

  describe("refreshToken", () => {
    it("sends the stored refresh token in the request body", async () => {
      const freshResp = mockAuthResponse({
        accessToken: "new.access.token",
        refreshToken: "new.refresh.token",
      })
      httpInstance.post.mockResolvedValue({ data: freshResp })

      const client = new StreamingClient({})
      setTokens(client, mockAuthResponse())

      const result = await client.refreshToken()

      expect(httpInstance.post).toHaveBeenCalledWith("/auth/refresh", {
        refreshToken: "refresh.token.here",
      })
      expect(result).toEqual(freshResp)
      expect(getTokens(client)).toEqual(freshResp)
    })

    it("throws when no refresh token is available", async () => {
      const client = new StreamingClient({})
      await expect(client.refreshToken()).rejects.toThrow(
        "No refresh token available"
      )
    })

    it("updates stored tokens on successful refresh", async () => {
      const freshResp = mockAuthResponse({
        accessToken: "new.access.token",
        refreshToken: "new.refresh.token",
      })
      httpInstance.post.mockResolvedValue({ data: freshResp })

      const client = new StreamingClient({})
      setTokens(client, mockAuthResponse())

      const result = await client.refreshToken()

      expect(httpInstance.post).toHaveBeenCalledWith("/auth/refresh", {
        refreshToken: "refresh.token.here",
      })
      expect(result).toEqual(freshResp)
      expect(getTokens(client)).toEqual(freshResp)
    })
  })

  // -- logout ------------------------------------------------------------

  describe("logout", () => {
    it("clears stored tokens", async () => {
      httpInstance.post.mockResolvedValue({})

      const client = new StreamingClient({})
      setTokens(client, mockAuthResponse())

      await client.logout()

      expect(getTokens(client)).toBeNull()
    })

    it("does not throw when no tokens are stored", async () => {
      httpInstance.post.mockResolvedValue({})

      const client = new StreamingClient({})
      await expect(client.logout()).resolves.toBeUndefined()
    })
  })

  // -- auto-refresh on 401 ----------------------------------------------

  describe("401 auto-refresh interceptor", () => {
    it("refreshes and retries the original request on 401", async () => {
      // Capture the response error handler
      let responseErrorHandler: ((error: unknown) => unknown) | null = null
      const instance = Object.assign(jest.fn(), {
        get: jest.fn(),
        post: jest.fn(),
        interceptors: {
          request: { use: jest.fn() },
          response: {
            use: jest.fn((_onFulfilled: unknown, onRejected: unknown) => {
              responseErrorHandler = onRejected as (error: unknown) => unknown
            }),
          },
        },
      })
      mockedAxios.create.mockReturnValue(instance as never)

      const client = new StreamingClient({})
      const tokens = mockAuthResponse()
      setTokens(client, tokens)

      // Setup refresh success
      const freshTokens = mockAuthResponse({
        accessToken: "fresh.access",
        refreshToken: "fresh.refresh",
      })
      instance.post.mockResolvedValue({ data: freshTokens })

      // Simulate a 401 error
      const originalConfig = {
        url: "/streams/123",
        headers: {} as Record<string, string>,
        _retry: undefined as boolean | undefined,
      }
      const error = {
        response: { status: 401 },
        config: originalConfig,
      }

      // The retry calls the axios instance (callable) with the original config
      instance.mockResolvedValue({ data: { id: "123", name: "test" } })

      // Trigger the error handler
      const resultPromise = responseErrorHandler!(error) as Promise<unknown>
      await resultPromise

      // Should have called refresh
      expect(instance.post).toHaveBeenCalledWith("/auth/refresh", {
        refreshToken: tokens.refreshToken,
      })
      // Original config should be marked as retry
      expect(originalConfig._retry).toBe(true)
      // Authorization header should be updated with new token
      expect(originalConfig.headers.Authorization).toBe("Bearer fresh.access")
    })

    it("does not retry when no refresh token is stored", async () => {
      let responseErrorHandler: ((error: unknown) => unknown) | null = null
      const instance = Object.assign(jest.fn(), {
        get: jest.fn(),
        post: jest.fn(),
        interceptors: {
          request: { use: jest.fn() },
          response: {
            use: jest.fn((_onFulfilled: unknown, onRejected: unknown) => {
              responseErrorHandler = onRejected as (error: unknown) => unknown
            }),
          },
        },
      })
      mockedAxios.create.mockReturnValue(instance as never)

      new StreamingClient({}) // provision instance, no tokens
      // No tokens set

      const error = {
        response: { status: 401 },
        config: { url: "/streams/123", headers: {} },
      }

      const result = responseErrorHandler!(error)
      await expect(result).rejects.toEqual(error)
    })
  })
})