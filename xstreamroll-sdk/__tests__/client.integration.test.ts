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

      // 3. Refresh token call
      nock(BASE_URL)
        .post("/auth/refresh", { refreshToken: "refresh-123" })
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
  })
})
