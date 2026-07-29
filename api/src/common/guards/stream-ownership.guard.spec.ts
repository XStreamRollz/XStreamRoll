import { ForbiddenException, UnauthorizedException } from "@nestjs/common"
import { AuthGuard } from "./auth.guard"
import { StreamOwnershipGuard } from "./stream-ownership.guard"
import { StreamOwnershipService } from "./stream-ownership.service"

interface MockAuthGuard {
  canActivate: jest.Mock<Promise<boolean>>
}

interface MockOwnershipService {
  ownsStream: jest.Mock<Promise<boolean>>
}

function makeGuard(
  authGuard: MockAuthGuard,
  ownership: MockOwnershipService,
): StreamOwnershipGuard {
  return new StreamOwnershipGuard(
    authGuard as unknown as AuthGuard,
    ownership as unknown as StreamOwnershipService,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { req, context: context as unknown as any }
}

describe("StreamOwnershipGuard", () => {
  let authGuard: MockAuthGuard
  let ownership: MockOwnershipService
  let guard: StreamOwnershipGuard

  beforeEach(() => {
    authGuard = { canActivate: jest.fn() }
    ownership = { ownsStream: jest.fn() }
    guard = makeGuard(authGuard, ownership)
    jest.clearAllMocks()
  })

  it("allows the owner of the requested stream", async () => {
    const { req, context } = contextWith("tok", "42")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authGuard.canActivate.mockImplementation(async (ctx: any) => {
      const r = ctx.switchToHttp().getRequest()
      r.auth = { userId: 1 }
      return true
    })
    ownership.ownsStream.mockResolvedValue(true)

    const result = await guard.canActivate(context)

    expect(result).toBe(true)
    expect(authGuard.canActivate).toHaveBeenCalledWith(context)
    expect(ownership.ownsStream).toHaveBeenCalledWith(1, 42)
    expect(req.auth).toEqual({ userId: 1 })
  })

  it("rejects a token whose jti is on the denylist", async () => {
    const { context } = contextWith("tok", "42")
    authGuard.canActivate.mockRejectedValue(
      new UnauthorizedException("access token has been revoked"),
    )

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("skips the denylist lookup for tokens without a jti", async () => {
    const { req, context } = contextWith("tok", "42")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authGuard.canActivate.mockImplementation(async (ctx: any) => {
      const r = ctx.switchToHttp().getRequest()
      r.auth = { userId: 1 }
      return true
    })
    ownership.ownsStream.mockResolvedValue(true)

    const result = await guard.canActivate(context)

    expect(result).toBe(true)
    expect(req.auth).toEqual({ userId: 1 })
  })

  it("rejects an invalid or expired token", async () => {
    const { context } = contextWith("tok", "42")
    authGuard.canActivate.mockRejectedValue(
      new UnauthorizedException("invalid or expired access token"),
    )

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("forbids access when the user does not own the stream", async () => {
    const { context } = contextWith("tok", "42")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authGuard.canActivate.mockImplementation(async (ctx: any) => {
      const r = ctx.switchToHttp().getRequest()
      r.auth = { userId: 1 }
      return true
    })
    ownership.ownsStream.mockResolvedValue(false)

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
  })

  it("forbids access with an invalid stream id", async () => {
    const { context } = contextWith("tok", "not-a-number")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authGuard.canActivate.mockImplementation(async (ctx: any) => {
      const r = ctx.switchToHttp().getRequest()
      r.auth = { userId: 1 }
      return true
    })

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
  })
})
