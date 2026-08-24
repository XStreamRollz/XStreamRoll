import { UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"

import { JwtExtractorService } from "./jwt-extractor.service"
import { TokenDenylistService } from "../../auth/token-denylist.service"
import { UsersRepository } from "../../auth/users.repository"

describe("JwtExtractorService", () => {
  const mockJwtService = { verifyAsync: jest.fn() }
  const mockDenylist = { isRevoked: jest.fn() }
  const mockUsersRepository = { findById: jest.fn() }
  let service: JwtExtractorService

  beforeEach(() => {
    jest.clearAllMocks()
    mockJwtService.verifyAsync.mockReset()
    mockDenylist.isRevoked.mockResolvedValue(false)
    mockUsersRepository.findById.mockReset()
    service = new JwtExtractorService(
      mockJwtService as unknown as JwtService,
      mockDenylist as unknown as TokenDenylistService,
      mockUsersRepository as unknown as UsersRepository,
    )
  })

  it("returns the userId and isAdmin=true when the token carries the claim", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 5, isAdmin: true })

    await expect(service.authenticate("Bearer tok")).resolves.toEqual({
      userId: 5,
      isAdmin: true,
    })
  })

  it("returns isAdmin=false when the token carries isAdmin=false", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 5, isAdmin: false })

    await expect(service.authenticate("Bearer tok")).resolves.toEqual({
      userId: 5,
      isAdmin: false,
    })
  })

  it("treats a legacy token without the isAdmin claim as non-admin", async () => {
    // Tokens minted before issue #511 land here — they must never grant
    // admin access, so the default has to be false.
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 5 })

    await expect(service.authenticate("Bearer tok")).resolves.toEqual({
      userId: 5,
      isAdmin: false,
    })
  })

  it("rejects a revoked token", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 5, jti: "abc" })
    mockDenylist.isRevoked.mockResolvedValue(true)

    await expect(service.authenticate("Bearer tok")).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("rejects a payload with a non-integer subject", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: "not-a-number" })

    await expect(service.authenticate("Bearer tok")).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("rejects a request with no Bearer token", async () => {
    await expect(service.authenticate(undefined)).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it("rejects a token minted before the user's last password change", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 5,
      passwordChangedAt: 1000,
    })
    mockUsersRepository.findById.mockResolvedValue({
      id: 5,
      password_changed_at: new Date(2000),
    })

    await expect(service.authenticate("Bearer tok")).rejects.toThrow(
      UnauthorizedException,
    )
  })
})
