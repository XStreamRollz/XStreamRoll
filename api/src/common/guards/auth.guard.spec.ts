import { UnauthorizedException } from "@nestjs/common"
import { AuthGuard } from "./auth.guard"
import { JwtExtractorService } from "./jwt-extractor.service"

interface MockJwtExtractor {
  authenticate: jest.Mock<Promise<number>>
  extractBearerToken: jest.Mock<string>
}

function makeGuard(extractor: MockJwtExtractor): AuthGuard {
  return new AuthGuard(extractor as unknown as JwtExtractorService)
}

function contextWithToken(token: string) {
  const req: { header: jest.Mock; auth?: { userId: number } } = {
    header: jest.fn().mockReturnValue(`Bearer ${token}`),
  }
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- NestJS ExecutionContext requires cast in tests
  return { req, context: context as unknown as any }
}

describe("AuthGuard", () => {
  let extractor: MockJwtExtractor
  let guard: AuthGuard

  beforeEach(() => {
    extractor = { authenticate: jest.fn(), extractBearerToken: jest.fn() }
    guard = makeGuard(extractor)
    jest.clearAllMocks()
  })

  it("allows a verified token whose jti is not revoked", async () => {
    const { req, context } = contextWithToken("tok")
    extractor.authenticate.mockResolvedValue(1)

    const result = await guard.canActivate(context)

    expect(result).toBe(true)
    expect(extractor.authenticate).toHaveBeenCalledWith("Bearer tok")
    expect(req.auth).toEqual({ userId: 1 })
  })

  it("rejects a token whose jti is on the denylist", async () => {
    const { context } = contextWithToken("tok")
    extractor.authenticate.mockRejectedValue(
      new UnauthorizedException("access token has been revoked"),
    )

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("skips the denylist lookup for tokens issued before the jti claim", async () => {
    const { req, context } = contextWithToken("tok")
    extractor.authenticate.mockResolvedValue(7)

    const result = await guard.canActivate(context)

    expect(result).toBe(true)
    expect(req.auth).toEqual({ userId: 7 })
  })

  it("rejects an invalid or expired token without a denylist lookup", async () => {
    const { context } = contextWithToken("tok")
    extractor.authenticate.mockRejectedValue(
      new UnauthorizedException("invalid or expired access token"),
    )

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("rejects a payload with a non-integer subject", async () => {
    const { context } = contextWithToken("tok")
    extractor.authenticate.mockRejectedValue(
      new UnauthorizedException("invalid access token"),
    )

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("rejects a request with no Bearer token", async () => {
    const { context } = contextWithToken("")
    extractor.authenticate.mockImplementation(() => {
      throw new UnauthorizedException(
        "Authorization header must contain a Bearer token",
      )
    })

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("rejects a token minted before the user's last password change", async () => {
    const { context } = contextWithToken("tok")
    extractor.authenticate.mockRejectedValue(
      new UnauthorizedException(
        "access token is no longer valid, please log in again",
      ),
    )

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("allows a token minted at or after the password change", async () => {
    const { req, context } = contextWithToken("tok")
    extractor.authenticate.mockResolvedValue(1)

    const result = await guard.canActivate(context)

    expect(result).toBe(true)
    expect(req.auth).toEqual({ userId: 1 })
  })

  it("rejects the token when the user no longer exists", async () => {
    const { context } = contextWithToken("tok")
    extractor.authenticate.mockRejectedValue(
      new UnauthorizedException("user not found"),
    )

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })
})
