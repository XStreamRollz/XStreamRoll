import { ForbiddenException, UnauthorizedException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import { RolesGuard } from "./roles.guard"

function makeGuard(requiredRoles: string[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector
  return new RolesGuard(reflector)
}

function contextWith(req: {
  user?: { sub: number; roles?: string[] }
  header?: jest.Mock
}): unknown {
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }
  return context
}

describe("RolesGuard", () => {
  it("is a no-op when no @Roles metadata is declared", () => {
    const guard = makeGuard(undefined)
    const context = contextWith({}) as never

    expect(guard.canActivate(context)).toBe(true)
  })

  it("rejects with 401 when no authenticated user is present", () => {
    const guard = makeGuard(["admin"])
    const context = contextWith({ header: jest.fn().mockReturnValue(undefined) })

    expect(() => guard.canActivate(context as never)).toThrow(
      UnauthorizedException,
    )
  })

  it("rejects with 401 even when the X-Roles header claims admin — the header fallback is gone", () => {
    const guard = makeGuard(["admin"])
    const context = contextWith({
      header: jest.fn().mockReturnValue("admin"),
    })

    expect(() => guard.canActivate(context as never)).toThrow(
      UnauthorizedException,
    )
  })

  it("rejects with 403 when the authenticated user lacks the required role", () => {
    const guard = makeGuard(["admin"])
    const context = contextWith({
      user: { sub: 1, roles: [] },
      header: jest.fn().mockReturnValue(undefined),
    })

    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    )
  })

  it("ignores the X-Roles header for an authenticated user without the role", () => {
    const guard = makeGuard(["admin"])
    const context = contextWith({
      user: { sub: 1, roles: [] },
      header: jest.fn().mockReturnValue("admin"),
    })

    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    )
  })

  it("allows an authenticated user with the required role", () => {
    const guard = makeGuard(["admin"])
    const context = contextWith({
      user: { sub: 1, roles: ["admin"] },
      header: jest.fn().mockReturnValue(undefined),
    })

    expect(guard.canActivate(context as never)).toBe(true)
  })

  it("allows any authenticated user when the handler requires a role they hold", () => {
    const guard = makeGuard(["moderator", "admin"])
    const context = contextWith({
      user: { sub: 1, roles: ["moderator"] },
    })

    expect(guard.canActivate(context as never)).toBe(true)
  })
})
