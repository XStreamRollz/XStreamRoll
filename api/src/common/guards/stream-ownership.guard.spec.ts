import {
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { StreamOwnershipGuard } from "./stream-ownership.guard"
import { StreamOwnershipService } from "./stream-ownership.service"
import { TokenDenylistService } from "../../auth/token-denylist.service"

interface MockJwtService {
  verifyAsync: jest.Mock<Promise<unknown>>
}

interface MockTokenDenylistService {
  isRevoked: jest.Mock<Promise<boolean>>
}

interface MockOwnershipService {
  ownsStream: jest.Mock<Promise<boolean>>
}

function makeGuard(
  ownership: MockOwnershipService,
  jwt: MockJwtService,
  denylist: MockTokenDenylistService,
): StreamOwnershipGuard {
  return new StreamOwnershipGuard(
    ownership as unknown as StreamOwnershipService,
    jwt as unknown as JwtService,
    denylist as unknown as TokenDenylistService,
  )
}

function contextWith(token: string, streamId: string) {
  const req: {
    header: jest.Mock
    params: { id: string }
    auth?: { userId: number }
  } = {
    header: jest.fn().mockReturnValue(`Bearer ${token}`),
    params: { id: streamId },
  }
  const context = { switchToHttp: () => ({ getRequest: () => req }) }
  return { req, context: context as unknown as any }
}

describe("StreamOwnershipGuard", () => {
  let ownership: MockOwnershipService
  let jwt: MockJwtService
  let denylist: MockTokenDenylistService
  let guard: StreamOwnershipGuard

  beforeEach(() => {
    ownership = { ownsStream: jest.fn() }
    jwt = { verifyAsync: jest.fn() }
    denylist = { isRevoked: jest.fn() }
    guard = makeGuard(ownership, jwt, denylist)
    jest.clearAllMocks()
  })

  it("allows the owner of the requested stream", async () => {
    const { req, context } = contextWith("tok", "42")
    jwt.verifyAsync.mockResolvedValue({ sub: 1, jti: "abc" })
    denylist.isRevoked.mockResolvedValue(false)
    ownership.ownsStream.mockResolvedValue(true)

    const result = await guard.canActivate(context)

    expect(result).toBe(true)
    expect(denylist.isRevoked).toHaveBeenCalledWith("abc")
    expect(ownership.ownsStream).toHaveBeenCalledWith(1, 42)
    expect(req.auth).toEqual({ userId: 1 })
  })

  it("rejects a token whose jti is on the denylist", async () => {
    const { context } = contextWith("tok", "42")
    jwt.verifyAsync.mockResolvedValue({ sub: 1, jti: "abc" })
    denylist.isRevoked.mockResolvedValue(true)

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("skips the denylist lookup for tokens without a jti", async () => {
    const { req, context } = contextWith("tok", "42")
    jwt.verifyAsync.mockResolvedValue({ sub: 1 })
    ownership.ownsStream.mockResolvedValue(true)

    const result = await guard.canActivate(context)

    expect(result).toBe(true)
    expect(denylist.isRevoked).not.toHaveBeenCalled()
    expect(req.auth).toEqual({ userId: 1 })
  })

  it("rejects an invalid or expired token", async () => {
    const { context } = contextWith("tok", "42")
    jwt.verifyAsync.mockRejectedValue(new Error("bad signature"))

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("forbids access when the user does not own the stream", async () => {
    const { context } = contextWith("tok", "42")
    jwt.verifyAsync.mockResolvedValue({ sub: 1, jti: "abc" })
    denylist.isRevoked.mockResolvedValue(false)
    ownership.ownsStream.mockResolvedValue(false)

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
  })

  it("forbids access with an invalid stream id", async () => {
    const { context } = contextWith("tok", "not-a-number")
    jwt.verifyAsync.mockResolvedValue({ sub: 1, jti: "abc" })
    denylist.isRevoked.mockResolvedValue(false)

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
  })
})
