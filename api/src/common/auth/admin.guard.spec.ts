import {
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common"

import { AdminGuard } from "./admin.guard"
import { RolesGuard } from "./roles.guard"
import { AuthGuard } from "../guards/auth.guard"

interface MockCanActivate {
  canActivate: jest.Mock<Promise<boolean> | boolean>
}

function makeGuard(
  authGuard: MockCanActivate,
  rolesGuard: MockCanActivate,
): AdminGuard {
  return new AdminGuard(
    authGuard as unknown as AuthGuard,
    rolesGuard as unknown as RolesGuard,
  )
}

describe("AdminGuard", () => {
  let authGuard: MockCanActivate
  let rolesGuard: MockCanActivate
  let guard: AdminGuard

  beforeEach(() => {
    authGuard = { canActivate: jest.fn() }
    rolesGuard = { canActivate: jest.fn() }
    guard = makeGuard(authGuard, rolesGuard)
    jest.clearAllMocks()
  })

  it("passes when authentication and the role check both succeed", async () => {
    authGuard.canActivate.mockResolvedValue(true)
    rolesGuard.canActivate.mockReturnValue(true)

    await expect(guard.canActivate({} as never)).resolves.toBe(true)
    expect(authGuard.canActivate).toHaveBeenCalledTimes(1)
    expect(rolesGuard.canActivate).toHaveBeenCalledTimes(1)
  })

  it("propagates UnauthorizedException from AuthGuard and skips the role check", async () => {
    authGuard.canActivate.mockRejectedValue(
      new UnauthorizedException("invalid or expired access token"),
    )

    await expect(guard.canActivate({} as never)).rejects.toThrow(
      UnauthorizedException,
    )
    expect(rolesGuard.canActivate).not.toHaveBeenCalled()
  })

  it("propagates ForbiddenException from RolesGuard for a non-admin identity", async () => {
    authGuard.canActivate.mockResolvedValue(true)
    rolesGuard.canActivate.mockImplementation(() => {
      throw new ForbiddenException("requires one of role(s): admin")
    })

    await expect(guard.canActivate({} as never)).rejects.toThrow(
      ForbiddenException,
    )
  })
})
