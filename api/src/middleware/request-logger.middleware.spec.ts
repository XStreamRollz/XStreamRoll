import { Response } from "express"
import { RequestLoggerMiddleware } from "./request-logger.middleware"
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
function makeRes(opts: FakeResOptions = {}): { res: Response; fire: () => void } {
  const listeners: Record<string, Array<() => void>> = {}
  const res = {
    statusCode: opts.statusCode ?? 200,
    getHeader(name: string) {
      if (name === "content-length") return opts.contentLength ?? null
      return null
    },
    on(event: string, cb: () => void) {
      listeners[event] = listeners[event] ?? []
      listeners[event].push(cb)
      return res
    },
  } as Response
  return {
    res,
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
    const { res, fire } = makeRes({ statusCode: 201, contentLength: "128" })

    mw.use(req, res, next)
    fire()

    expect(next).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(errSpy).not.toHaveBeenCalled()

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
    })
    expect(typeof parsed.timestamp).toBe("string")
    expect(typeof parsed.durationMs).toBe("number")
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
  })
})
