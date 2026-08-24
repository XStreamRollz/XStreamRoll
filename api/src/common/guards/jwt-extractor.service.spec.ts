import { UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"

import { JwtExtractorService } from "./jwt-extractor.service"
import { TokenDenylistService, TokenJti } from "../../auth/token-denylist.service"
import { UsersRepository } from "../../auth/users.repository"

const JTI = "550e8400-e29b-41d4-a716-446655440000" as TokenJti

describe("JwtExtractorService", () => {
  let extractor: JwtExtractorService
  let jwtService: { verifyAsync: jest.Mock }
  let denylist: { isRevoked: jest.Mock; revoke: jest.Mock }
  let users: { findById: jest.Mock }

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() }
    denylist = { isRevoked: jest.fn(), revoke: jest.fn() }
    users = { findById: jest.fn() }

    extractor = new JwtExtractorService(
      jwtService as unknown as JwtService,
      denylist as unknown as TokenDenylistService,
      users as unknown as UsersRepository,
    )
  })

  it("rejects a revoked access token by its jti (issue #510)", async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 1, jti: JTI })
    denylist.isRevoked.mockResolvedValue(true)

    await expect(extractor.authenticate("Bearer a.b.c")).rejects.toThrow(
      UnauthorizedException,
    )
    await expect(extractor.authenticate("Bearer a.b.c")).rejects.toThrow(
      "access token has been revoked",
    )
    expect(denylist.isRevoked).toHaveBeenCalledWith(JTI)
  })

  it("allows an access token whose jti is not revoked", async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 1, jti: JTI })
    denylist.isRevoked.mockResolvedValue(false)

    await expect(extractor.authenticate("Bearer a.b.c")).resolves.toBe(1)
    expect(denylist.isRevoked).toHaveBeenCalledWith(JTI)
  })

  it("skips the denylist lookup for legacy tokens without a jti", async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 1 })

    await expect(extractor.authenticate("Bearer a.b.c")).resolves.toBe(1)
    expect(denylist.isRevoked).not.toHaveBeenCalled()
  })

  it("rejects a token minted before the user's last password change", async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 1, passwordChangedAt: 100 })
    users.findById.mockResolvedValue({
      id: 1,
      password_changed_at: new Date("2026-01-02T00:00:00Z"),
      created_at: new Date("2026-01-01T00:00:00Z"),
    })

    await expect(extractor.authenticate("Bearer a.b.c")).rejects.toThrow(
      "access token is no longer valid, please log in again",
    )
  })

  it("allows a token minted at or after the password change", async () => {
    const changedAt = new Date("2026-01-02T00:00:00Z").getTime()
    jwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      passwordChangedAt: changedAt,
    })
    users.findById.mockResolvedValue({
      id: 1,
      password_changed_at: new Date(changedAt),
      created_at: new Date("2026-01-01T00:00:00Z"),
    })

    await expect(extractor.authenticate("Bearer a.b.c")).resolves.toBe(1)
  })

  it("throws UnauthorizedException for a missing or malformed header", async () => {
    await expect(extractor.authenticate(undefined)).rejects.toThrow(
      UnauthorizedException,
    )
    await expect(extractor.authenticate("Basic abc")).rejects.toThrow(
      UnauthorizedException,
    )
    expect(jwtService.verifyAsync).not.toHaveBeenCalled()
  })
})
