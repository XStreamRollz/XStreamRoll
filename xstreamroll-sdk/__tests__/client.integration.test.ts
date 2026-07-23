import nock from "nock"
import { StreamingClient } from "../src/client"
import { ApiError } from "../src/types"

const BASE_URL = "http://api.test"

describe("StreamingClient Integration", () => {
  let client: StreamingClient

  beforeEach(() => {
    client = new StreamingClient({ baseUrl: BASE_URL })
    if (!nock.isActive()) {
      nock.activate()
    }
  })

  afterEach(() => {
    nock.cleanAll()
    nock.restore()
  })

  describe("auth", () => {
    it("login with valid credentials returns tokens", async () => {
      const tokens = {
        accessToken: "access-123",
        refreshToken: "refresh-123",
        expiresIn: 3600,
      }

      nock(BASE_URL)
        .post("/auth/login", { email: "test@example.com", password: "password" })
        .reply(200, tokens)

      const result = await client.login("test@example.com", "password")
      expect(result).toEqual(tokens)
    })

    it("login with invalid credentials throws ApiError", async () => {
      const errorResponse = {
        statusCode: 401,
        message: "Unauthorized",
        error: "Unauthorized",
      }

      nock(BASE_URL)
        .post("/auth/login")
        .reply(401, errorResponse)

      await expect(client.login("wrong@example.com", "wrong")).rejects.toThrow(ApiError)
    })

    it("register with valid data returns tokens", async () => {
      const dto = {
        email: "new@example.com",
        password: "password",
        displayName: "New User",
      }
      const tokens = {
        accessToken: "access-456",
        refreshToken: "refresh-456",
        expiresIn: 3600,
      }

      nock(BASE_URL)
        .post("/auth/register", dto)
        .reply(201, tokens)

      const result = await client.register(dto)
      expect(result).toEqual(tokens)
    })

    it("logout clears tokens and calls logout endpoint", async () => {
      nock(BASE_URL).post("/auth/login").reply(200, {
        accessToken: "abc",
        refreshToken: "def",
        expiresIn: 3600,
      })
      await client.login("test@example.com", "password")

      nock(BASE_URL).post("/auth/logout").reply(200)

      await client.logout()
      expect(nock.isDone()).toBe(true)

      // Subsequent request should not have Authorization header
      nock(BASE_URL)
        .get("/streams/1")
        .matchHeader("authorization", (val) => !val)
        .reply(200, {})

      await client.getStreamStatus("1")
      expect(nock.isDone()).toBe(true)
    })
  })

  describe("streams", () => {
    it("publishEvent sends correct body and headers", async () => {
      const event = {
        streamId: "stream-1",
        eventType: "data" as const,
        data: { foo: "bar" },
      }

      nock(BASE_URL)
        .post("/streams/events", (body) => {
          return (
            body.streamId === event.streamId &&
            body.eventType === event.eventType &&
            body.data.foo === "bar" &&
            typeof body.timestamp === "string" &&
            typeof body.clientId === "string"
          )
        })
        .reply(201)

      await client.publishEvent(event)
      expect(nock.isDone()).toBe(true)
    })

    it("getStreamStatus returns parsed stream data", async () => {
      const streamData = {
        id: "stream-1",
        userId: "user-1",
        name: "Test Stream",
        status: "active",
      }

      nock(BASE_URL)
        .get("/streams/stream-1")
        .reply(200, streamData)

      const result = await client.getStreamStatus("stream-1")
      expect(result).toEqual(streamData)
    })
  })

  describe("webhooks", () => {
    it("subscribeWebhook sends the dto and returns the created subscription", async () => {
      const dto = {
        streamId: "stream-1",
        url: "https://example.com/hook",
        events: ["stream:started" as const, "stream:stopped" as const],
      }
      const created = {
        id: "wh-1",
        userId: "user-1",
        streamId: dto.streamId,
        url: dto.url,
        events: dto.events,
        secret: "generated-secret",
        active: true,
        createdAt: new Date().toISOString(),
      }

      nock(BASE_URL)
        .post("/webhooks", (body) => {
          return (
            body.streamId === dto.streamId &&
            body.url === dto.url &&
            Array.isArray(body.events) &&
            body.events.length === 2
          )
        })
        .reply(201, created)

      const result = await client.subscribeWebhook(dto)
      expect(result).toEqual(created)
      expect(nock.isDone()).toBe(true)
    })

    it("surfaces a 403 as ApiError when the caller does not own the stream", async () => {
      nock(BASE_URL)
        .post("/webhooks")
        .reply(403, { statusCode: 403, message: "Forbidden", error: "Forbidden" })

      await expect(
        client.subscribeWebhook({
          streamId: "stream-1",
          url: "https://example.com/hook",
          events: ["stream:started"],
        }),
      ).rejects.toThrow(ApiError)
    })
  })

  describe("token refresh", () => {
    it("automatically retries with new token on 401", async () => {
      // 1. Initial login to set tokens
      nock(BASE_URL)
        .post("/auth/login")
        .reply(200, {
          accessToken: "old-access",
          refreshToken: "refresh-123",
          expiresIn: 3600,
        })

      await client.login("test@example.com", "password")

      // 2. Request fails with 401
      nock(BASE_URL)
        .get("/streams/stream-1")
        .reply(401)

      // 3. Refresh token call (no body, relies on cookie/server-side session)
      nock(BASE_URL)
        .post("/auth/refresh")
        .reply(200, {
          accessToken: "new-access",
          refreshToken: "new-refresh",
          expiresIn: 3600,
        })

      // 4. Retry request with new token
      nock(BASE_URL)
        .get("/streams/stream-1")
        .matchHeader("Authorization", "Bearer new-access")
        .reply(200, { id: "stream-1", status: "active" })

      const result = await client.getStreamStatus("stream-1")
      expect(result.id).toBe("stream-1")
      expect(nock.isDone()).toBe(true)
    })

    it("does not refresh on 401 when skipAuthRefresh applies (login)", async () => {
      nock(BASE_URL).post("/auth/login").reply(401, {
        statusCode: 401,
        message: "Unauthorized",
        error: "Unauthorized",
      })

      await expect(client.login("a@b.com", "bad")).rejects.toThrow(ApiError)
      expect(nock.isDone()).toBe(true)
    })
  })

  describe("errors and auth headers", () => {
    it("attaches Authorization header after login", async () => {
      nock(BASE_URL).post("/auth/login").reply(200, {
        accessToken: "tok-abc",
        refreshToken: "ref-abc",
        expiresIn: 3600,
      })
      await client.login("test@example.com", "password")

      nock(BASE_URL)
        .get("/streams/1")
        .matchHeader("Authorization", "Bearer tok-abc")
        .reply(200, { id: "1", status: "active" })

      await client.getStreamStatus("1")
      expect(nock.isDone()).toBe(true)
    })

    it("maps non-2xx responses to ApiError with status and message", async () => {
      nock(BASE_URL)
        .get("/streams/missing")
        .reply(404, {
          statusCode: 404,
          message: "Stream not found",
          error: "Not Found",
        })

      try {
        await client.getStreamStatus("missing")
        fail("expected ApiError")
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        const apiErr = err as ApiError
        expect(apiErr.statusCode).toBe(404)
        expect(apiErr.message).toBe("Stream not found")
      }
    })

    it("maps array error messages into a joined string", async () => {
      nock(BASE_URL)
        .post("/auth/register")
        .reply(400, {
          statusCode: 400,
          message: ["email must be an email", "password too short"],
          error: "Bad Request",
        })

      try {
        await client.register({
          email: "bad",
          password: "x",
          displayName: "x",
        })
        fail("expected ApiError")
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        expect((err as ApiError).message).toBe("email must be an email, password too short")
      }
    })

    it("handles empty successful response bodies", async () => {
      nock(BASE_URL).post("/streams/events").reply(201)

      await expect(
        client.publishEvent({
          streamId: "s1",
          eventType: "data",
          data: {},
        })
      ).resolves.toBeUndefined()
    })

    it("retries transient 503 via HttpClient withRetry then succeeds", async () => {
      nock(BASE_URL)
        .get("/streams/flaky")
        .reply(503, { statusCode: 503, message: "Unavailable", error: "Service Unavailable" })
      nock(BASE_URL)
        .get("/streams/flaky")
        .reply(200, { id: "flaky", status: "active" })

      const result = await client.getStreamStatus("flaky")
      expect(result.id).toBe("flaky")
      expect(nock.isDone()).toBe(true)
    })

    it("maps exhausted retryable errors to ApiError", async () => {
      nock(BASE_URL)
        .get("/streams/down")
        .times(3)
        .reply(503, {
          statusCode: 503,
          message: "Unavailable",
          error: "Service Unavailable",
        })

      await expect(client.getStreamStatus("down")).rejects.toMatchObject({
        name: "ApiError",
        statusCode: 503,
        message: "Unavailable",
      })
    })

    it("surfaces network failures from publishEvent", async () => {
      nock(BASE_URL).post("/streams/events").replyWithError("ECONNRESET")

      await expect(
        client.publishEvent({
          streamId: "s1",
          eventType: "data",
          data: {},
        })
      ).rejects.toThrow()
    })

    it("surfaces network failures from getStreamStatus", async () => {
      nock(BASE_URL).get("/streams/1").replyWithError("ECONNRESET")

      await expect(client.getStreamStatus("1")).rejects.toThrow()
    })

    it("logout swallows endpoint failures and still clears tokens", async () => {
      nock(BASE_URL).post("/auth/login").reply(200, {
        accessToken: "abc",
        refreshToken: "def",
        expiresIn: 3600,
      })
      await client.login("test@example.com", "password")

      nock(BASE_URL).post("/auth/logout").reply(400, {
        statusCode: 400,
        message: "bad logout",
        error: "Bad Request",
      })

      await expect(client.logout()).resolves.toBeUndefined()

      nock(BASE_URL)
        .get("/streams/1")
        .matchHeader("authorization", (val) => !val)
        .reply(200, { id: "1" })

      await client.getStreamStatus("1")
      expect(nock.isDone()).toBe(true)
    })
  })
})
