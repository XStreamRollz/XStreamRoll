import { ExecutionContext, UnauthorizedException } from "@nestjs/common"

import { StreamApiKeyGuard } from "./stream-api-key.guard"

const VALID_KEY = "sk-test-123"

function contextWithHeader(
  value: string | string[] | undefined,
): ExecutionContext {
  const req = { headers: { "x-stream-api-key": value } }
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext
}

describe("StreamApiKeyGuard (issue #514)", () => {
  let guard: StreamApiKeyGuard

  beforeEach(() => {
    process.env.STREAM_API_KEY = VALID_KEY
    guard = new StreamApiKeyGuard()
  })

  afterEach(() => {
    delete process.env.STREAM_API_KEY
  })

  it("allows a request with the correct API key", () => {
    expect(guard.canActivate(contextWithHeader(VALID_KEY))).toBe(true)
  })

  it("rejects a request with a missing header", () => {
    expect(() => guard.canActivate(contextWithHeader(undefined))).toThrow(
      UnauthorizedException,
    )
    expect(() => guard.canActivate(contextWithHeader(undefined))).toThrow(
      "missing stream API key",
    )
  })

  it("rejects a request with an empty key", () => {
    expect(() => guard.canActivate(contextWithHeader(""))).toThrow(
      UnauthorizedException,
    )
  })

  it("rejects a request with the wrong key (fixed-length compare)", () => {
    expect(() =>
      guard.canActivate(contextWithHeader("sk-test-999")),
    ).toThrow(UnauthorizedException)
    expect(() =>
      guard.canActivate(contextWithHeader("a-short-key")),
    ).toThrow(UnauthorizedException)
  })

  it("rejects every request when STREAM_API_KEY is not configured", () => {
    delete process.env.STREAM_API_KEY
    expect(() => guard.canActivate(contextWithHeader(VALID_KEY))).toThrow(
      "stream API key is not configured",
    )
  })
})
