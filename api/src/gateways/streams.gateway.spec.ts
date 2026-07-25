import { Test } from "@nestjs/testing"
import { JwtService } from "@nestjs/jwt"
import { StreamsGateway, resolveCorsOrigins } from "./streams.gateway"
import { NOTIFICATION_EVENTS, STREAM_EVENTS } from "./stream-events"

type FakeHandshake = {
  auth?: Record<string, unknown>
  headers?: Record<string, string>
  query?: Record<string, unknown>
}

type FakeSocket = {
  id: string
  handshake: FakeHandshake
  data: Record<string, unknown>
  join: jest.Mock
  leave: jest.Mock
  emit: jest.Mock
  disconnect: jest.Mock
}

type FakeServer = {
  to: jest.Mock
}

function makeSocket(overrides: Partial<FakeSocket> = {}): FakeSocket {
  return {
    id: "socket-1",
    handshake: { auth: {}, headers: {}, query: {} },
    data: {},
    join: jest.fn(async () => {}),
    leave: jest.fn(async () => {}),
    emit: jest.fn(() => {}),
    disconnect: jest.fn(() => {}),
    ...overrides,
  }
}

function makeServer(): {
  server: FakeServer
  events: Array<{ room: string; event: string; payload: unknown }>
} {
  const events: Array<{ room: string; event: string; payload: unknown }> = []
  const server: FakeServer = {
    to: jest.fn().mockImplementation((room: string) => ({
      emit: jest.fn((event: string, payload: unknown) => {
        events.push({ room, event, payload })
      }),
    })),
  }
  return { server, events }
}

describe("resolveCorsOrigins", () => {
  it("falls back to localhost:3000 when CORS_ORIGIN is unset", () => {
    expect(resolveCorsOrigins(undefined)).toBe("http://localhost:3000")
  })

  it("falls back to localhost:3000 when CORS_ORIGIN is empty or blank", () => {
    expect(resolveCorsOrigins("")).toBe("http://localhost:3000")
    expect(resolveCorsOrigins("   ")).toBe("http://localhost:3000")
  })

  it("returns a single configured origin as a string", () => {
    expect(resolveCorsOrigins("https://app.xstreamroll.com")).toBe(
      "https://app.xstreamroll.com",
    )
  })

  it("returns multiple comma-separated origins as a trimmed array", () => {
    expect(
      resolveCorsOrigins(
        "https://app.xstreamroll.com, https://admin.xstreamroll.com",
      ),
    ).toEqual(["https://app.xstreamroll.com", "https://admin.xstreamroll.com"])
  })

  it("ignores empty entries in the list", () => {
    expect(resolveCorsOrigins("https://a.com,,  ,https://b.com")).toEqual([
      "https://a.com",
      "https://b.com",
    ])
  })

  it("never returns the insecure wildcard origin", () => {
    expect(resolveCorsOrigins(undefined)).not.toBe("*")
    expect(resolveCorsOrigins("https://a.com,https://b.com")).not.toContain("*")
  })

  it("warns and falls back to default origin when CORS_ORIGIN is malformed in non-production", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    const result = resolveCorsOrigins("not-a-valid-url")
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(result).toBe("http://localhost:3000")
    warnSpy.mockRestore()
  })

  it("logs an error and exits process when CORS_ORIGIN is malformed in production", () => {
    const origEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => {}) as never)

    resolveCorsOrigins("invalid-url")

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid CORS_ORIGIN "invalid-url"'),
    )
    expect(exitSpy).toHaveBeenCalledWith(1)

    process.env.NODE_ENV = origEnv
    errorSpy.mockRestore()
    exitSpy.mockRestore()
  })
})

describe("StreamsGateway", () => {
  let gateway: StreamsGateway
  let jwtService: { verifyAsync: jest.Mock }

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StreamsGateway,
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
      ],
    }).compile()

    gateway = module.get(StreamsGateway)
    jwtService = module.get(JwtService) as unknown as { verifyAsync: jest.Mock }
  })

  describe("handleConnection", () => {
    it("connects a client with a valid JWT", async () => {
      const socket = makeSocket({
        handshake: { auth: { token: "valid-token" } },
      })
      jwtService.verifyAsync.mockResolvedValue({ sub: 42 })

      await gateway.handleConnection(socket as unknown as any)

      expect(jwtService.verifyAsync).toHaveBeenCalledWith("valid-token")
      expect(socket.data.userId).toBe(42)
      expect(socket.emit).toHaveBeenCalledWith("connected", { userId: 42 })
      expect(socket.disconnect).not.toHaveBeenCalled()
      expect(socket.join).toHaveBeenCalledWith("user:42")
    })

    it("rejects a client with an invalid JWT", async () => {
      const socket = makeSocket({ handshake: { auth: { token: "bad-token" } } })
      jwtService.verifyAsync.mockRejectedValue(new Error("jwt malformed"))

      await gateway.handleConnection(socket as unknown as any)

      expect(socket.emit).toHaveBeenCalledWith(
        STREAM_EVENTS.ERROR,
        expect.objectContaining({
          code: "INVALID_TOKEN",
          message: expect.stringContaining("JWT verification failed"),
        }),
      )
      expect(socket.disconnect).toHaveBeenCalledWith(true)
    })

    it("rejects a client with no token", async () => {
      const socket = makeSocket({ handshake: { auth: {} } })

      await gateway.handleConnection(socket as unknown as any)

      expect(socket.emit).toHaveBeenCalledWith(
        STREAM_EVENTS.ERROR,
        expect.objectContaining({
          code: "MISSING_TOKEN",
          message: expect.stringContaining("Authentication token required"),
        }),
      )
      expect(socket.disconnect).toHaveBeenCalledWith(true)
      expect(jwtService.verifyAsync).not.toHaveBeenCalled()
    })

    it("accepts a token from the Authorization header fallback", async () => {
      const socket = makeSocket({
        handshake: {
          auth: {},
          headers: { authorization: "Bearer header-token" },
        },
      })
      jwtService.verifyAsync.mockResolvedValue({ sub: "user-99" })

      await gateway.handleConnection(socket as unknown as any)

      expect(jwtService.verifyAsync).toHaveBeenCalledWith("header-token")
      expect(socket.emit).toHaveBeenCalledWith("connected", {
        userId: "user-99",
      })
    })
  })

  describe("stream room lifecycle", () => {
    it("allows an authenticated client to subscribe", () => {
      const socket = makeSocket({ data: { userId: 55 } })
      const result = gateway.handleSubscribe(socket as unknown as any, {
        streamId: "abc",
      })

      expect(result).toEqual({ ok: true, room: "stream:abc" })
      expect(socket.join).toHaveBeenCalledWith("stream:abc")
    })

    it("rejects an unauthenticated client from subscribing", () => {
      const socket = makeSocket({ data: {} })
      const result = gateway.handleSubscribe(socket as unknown as any, {
        streamId: "abc",
      })

      expect(result).toEqual({ ok: false, error: "unauthenticated" })
      expect(socket.join).not.toHaveBeenCalled()
    })

    it("rejects an authenticated client from subscribing without a streamId", () => {
      const socket = makeSocket({ data: { userId: 55 } })
      const result = gateway.handleSubscribe(socket as unknown as any, {})

      expect(result).toEqual({ ok: false, error: "streamId required" })
      expect(socket.join).not.toHaveBeenCalled()
    })

    it("allows an authenticated client to unsubscribe", () => {
      const socket = makeSocket({ data: { userId: 55 } })
      const result = gateway.handleUnsubscribe(socket as unknown as any, {
        streamId: "abc",
      })

      expect(result).toEqual({ ok: true, room: "stream:abc" })
      expect(socket.leave).toHaveBeenCalledWith("stream:abc")
    })

    it("rejects an unauthenticated client from unsubscribing", () => {
      const socket = makeSocket({ data: {} })
      const result = gateway.handleUnsubscribe(socket as unknown as any, {
        streamId: "abc",
      })

      expect(result).toEqual({ ok: false, error: "unauthenticated" })
      expect(socket.leave).not.toHaveBeenCalled()
    })

    it("rejects unsubscribe calls without a streamId", () => {
      const socket = makeSocket({ data: { userId: 55 } })
      const result = gateway.handleUnsubscribe(socket as unknown as any, {})

      expect(result).toEqual({ ok: false, error: "streamId required" })
      expect(socket.leave).not.toHaveBeenCalled()
    })

    it("supports duplicate subscriptions without failure", () => {
      const socket = makeSocket({ data: { userId: 55 } })
      gateway.handleSubscribe(socket as unknown as any, { streamId: "abc" })
      const second = gateway.handleSubscribe(socket as unknown as any, {
        streamId: "abc",
      })

      expect(second).toEqual({ ok: true, room: "stream:abc" })
      expect(socket.join).toHaveBeenCalledTimes(2)
    })
  })

  describe("emit helpers", () => {
    it("broadcasts only to the correct stream room", () => {
      const { server, events } = makeServer()
      gateway.server = server as unknown as any

      gateway.emitStarted({
        streamId: "1",
        userId: 1,
        startedAt: "2026-06-16T00:00:00Z",
      })
      gateway.emitStopped({
        streamId: "2",
        userId: 2,
        stoppedAt: "2026-06-16T00:00:00Z",
      })
      gateway.emitError({
        streamId: "3",
        occurredAt: "2026-06-16T00:00:00Z",
        code: "ERR",
        message: "boom",
      })

      expect(events).toEqual([
        {
          room: "stream:1",
          event: STREAM_EVENTS.STARTED,
          payload: {
            streamId: "1",
            userId: 1,
            startedAt: "2026-06-16T00:00:00Z",
          },
        },
        {
          room: "stream:2",
          event: STREAM_EVENTS.STOPPED,
          payload: {
            streamId: "2",
            userId: 2,
            stoppedAt: "2026-06-16T00:00:00Z",
          },
        },
        {
          room: "stream:3",
          event: STREAM_EVENTS.ERROR,
          payload: {
            streamId: "3",
            occurredAt: "2026-06-16T00:00:00Z",
            code: "ERR",
            message: "boom",
          },
        },
      ])
    })

    it("broadcasts notifications only to the target user's room", () => {
      const { server, events } = makeServer()
      gateway.server = server as unknown as any

      gateway.emitNotification({
        id: 1,
        userId: 42,
        type: "stream:error",
        payload: { streamId: "1" },
        createdAt: "2026-06-16T00:00:00Z",
      })

      expect(events).toEqual([
        {
          room: "user:42",
          event: NOTIFICATION_EVENTS.NEW,
          payload: {
            id: 1,
            userId: 42,
            type: "stream:error",
            payload: { streamId: "1" },
            createdAt: "2026-06-16T00:00:00Z",
          },
        },
      ])
    })
  })

  describe("handleDisconnect", () => {
    it("does not throw when a socket disconnects", () => {
      const socket = makeSocket({ data: { userId: 99 } })
      expect(() =>
        gateway.handleDisconnect(socket as unknown as any),
      ).not.toThrow()
    })
  })
})
