import { Response } from "express"
import {
  RequestLoggerMiddleware,
  getRequestId,
} from "./request-logger.middleware"
import type { AuthedRequest } from "./request-logger.middleware"

type FakeResOptions = {
  statusCode?: number
  contentLength?: string | number | null
}

/**
 * Build a fake Express Request shaped as AuthedRequest.
 * Only the properties read by the middleware are populated.
 */
function makeReq(overrides: Partial<{
  method: string
  path: string
  originalUrl: string
  ip: string
  headers: Record<string, string>
  user: { id: number | string } | null
}> = {}): AuthedRequest {
  return {
    method: overrides.method ?? "GET",
    path: overrides.path ?? "/streams",
    originalUrl: overrides.originalUrl ?? "/streams",
    ip: overrides.ip ?? "127.0.0.1",
    headers: overrides.headers ?? { "user-agent": "jest" },
    user: "user" in overrides ? overrides.user ?? undefined : undefined,
  } as AuthedRequest
}

/**
 * Build a fake Express Response and return it alongside a `fire()`
 * helper that triggers the registered "finish" listener, simulating
 * Express' response-completion lifecycle.
 */
function makeRes(opts: FakeResOptions = {}): {
  res: Response
  headers: Record<string, string>
  fire: () => void
} {
  const listeners: Record<string, Array<() => void>> = {}
  const headers: Record<string, string> = {}
  const res = {
    statusCode: opts.statusCode ?? 200,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value
      return res
    },
    getHeader(name: string) {
      if (name.toLowerCase() in headers) return headers[name.toLowerCase()]
      if (name === "content-length") return opts.contentLength ?? null
      return null
    },
    on(event: string, cb: () => void) {
      listeners[event] = listeners[event] ?? []
      listeners[event].push(cb)
      return res
    },
  } as unknown as Response
  return {
    res,
    headers,
    fire: () => {
      for (const cb of listeners["finish"] ?? []) cb()
    },
  }
}

describe("RequestLoggerMiddleware", () => {
  let logSpy: jest.SpyInstance
  let errSpy: jest.SpyInstance
  let next: jest.Mock

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {})
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    next = jest.fn()
  })

  afterEach(() => {
    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  it("logs a 2xx request with the required fields on completion", () => {
    const mw = new RequestLoggerMiddleware()
    const req = makeReq({
      method: "POST",
      originalUrl: "/streams",
      path: "/streams",
      headers: { "user-agent": "jest", "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
      user: { id: 42 },
    })
    const { res, headers, fire } = makeRes({ statusCode: 201, contentLength: "128" })

    mw.use(req, res, next)
    fire()

    expect(next).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(errSpy).not.toHaveBeenCalled()
    expect(headers["x-request-id"]).toBeDefined()

    const line = logSpy.mock.calls[0][0]
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({
      type: "http_request",
      method: "POST",
      path: "/streams",
      statusCode: 201,
      userId: 42,
      ip: "1.2.3.4",
      bodyRedacted: false,
      contentLength: "128",
      requestId: headers["x-request-id"],
    })
    expect(typeof parsed.timestamp).toBe("string")
    expect(typeof parsed.durationMs).toBe("number")
  })

  it("propagates incoming X-Request-Id header and AsyncLocalStorage context", () => {
    const mw = new RequestLoggerMiddleware()
    const req = makeReq({
      headers: { "x-request-id": "custom-req-123" },
    })
    const { res, headers, fire } = makeRes()

    let contextIdInNext: string | undefined
    next.mockImplementation(() => {
      contextIdInNext = getRequestId()
    })

    mw.use(req, res, next)
    fire()

    expect(headers["x-request-id"]).toBe("custom-req-123")
    expect(contextIdInNext).toBe("custom-req-123")
    const parsed = JSON.parse(logSpy.mock.calls[0][0])
    expect(parsed.requestId).toBe("custom-req-123")
  })

  it("marks sensitive /auth paths with bodyRedacted=true and leaves userId null when unauth", () => {
    const mw = new RequestLoggerMiddleware()
    const req = makeReq({
      method: "POST",
      originalUrl: "/auth/login",
      path: "/auth/login",
      user: null,
    })
    const { res, fire } = makeRes({ statusCode: 401 })

    mw.use(req, res, next)
    fire()

    const line = logSpy.mock.calls[0][0]
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({
      path: "/auth/login",
      statusCode: 401,
      userId: null,
      bodyRedacted: true,
    })
    expect(parsed.requestId).toBeDefined()
  })

  it("routes 5xx responses to console.error", () => {
    const mw = new RequestLoggerMiddleware()
    const req = makeReq({
      method: "GET",
      originalUrl: "/streams/boom",
      path: "/streams/boom",
    })
    const { res, fire } = makeRes({ statusCode: 500 })

    mw.use(req, res, next)
    fire()

    expect(logSpy).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse(errSpy.mock.calls[0][0])
    expect(parsed.statusCode).toBe(500)
    expect(parsed.requestId).toBeDefined()
  })
})
