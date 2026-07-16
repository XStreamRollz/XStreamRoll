import { UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { AuthGuard } from "./auth.guard"
import { TokenDenylistService } from "../../auth/token-denylist.service"

interface MockJwtService {
  verifyAsync: jest.Mock<Promise<unknown>>
}

interface MockTokenDenylistService {
  isRevoked: jest.Mock<Promise<boolean>>
}

function makeGuard(
  jwt: MockJwtService,
  denylist: MockTokenDenylistService,
): AuthGuard {
  return new AuthGuard(
    jwt as unknown as JwtService,
    denylist as unknown as TokenDenylistService,
  )
}

function contextWithToken(token: string) {
  const req: { header: jest.Mock; auth?: { userId: number } } = {
    header: jest.fn().mockReturnValue(`Bearer ${token}`),
  }
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  }
  return { req, context: context as unknown as any }
}

describe("AuthGuard", () => {
  let jwt: MockJwtService
  let denylist: MockTokenDenylistService
  let guard: AuthGuard

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() }
    denylist = { isRevoked: jest.fn() }
    guard = makeGuard(jwt, denylist)
    jest.clearAllMocks()
  })

  it("allows a verified token whose jti is not revoked", async () => {
    const { req, context } = contextWithToken("tok")
    jwt.verifyAsync.mockResolvedValue({ sub: 1, jti: "abc" })
    denylist.isRevoked.mockResolvedValue(false)

    const result = await guard.canActivate(context)

    expect(result).toBe(true)
    expect(jwt.verifyAsync).toHaveBeenCalledWith("tok")
    expect(denylist.isRevoked).toHaveBeenCalledWith("abc")
    expect(req.auth).toEqual({ userId: 1 })
  })

  it("rejects a token whose jti is on the denylist", async () => {
    const { context } = contextWithToken("tok")
    jwt.verifyAsync.mockResolvedValue({ sub: 1, jti: "abc" })
    denylist.isRevoked.mockResolvedValue(true)

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
    expect(denylist.isRevoked).toHaveBeenCalledWith("abc")
  })

  it("skips the denylist lookup for tokens issued before the jti claim", async () => {
    const { req, context } = contextWithToken("tok")
    jwt.verifyAsync.mockResolvedValue({ sub: 7 })

    const result = await guard.canActivate(context)

    expect(result).toBe(true)
    expect(denylist.isRevoked).not.toHaveBeenCalled()
    expect(req.auth).toEqual({ userId: 7 })
  })

  it("rejects an invalid or expired token without a denylist lookup", async () => {
    const { context } = contextWithToken("tok")
    jwt.verifyAsync.mockRejectedValue(new Error("bad signature"))

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
    expect(denylist.isRevoked).not.toHaveBeenCalled()
  })

  it("rejects a payload with a non-integer subject", async () => {
    const { context } = contextWithToken("tok")
    jwt.verifyAsync.mockResolvedValue({ sub: "not-a-number", jti: "abc" })

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("rejects a request with no Bearer token", async () => {
    const { context } = contextWithToken("")
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })
})
