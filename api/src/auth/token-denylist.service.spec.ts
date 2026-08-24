import { createHash } from "crypto"

import { CACHE_MANAGER } from "@nestjs/cache-manager"
import { UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { Test, TestingModule } from "@nestjs/testing"
import { Cache } from "cache-manager"

import { TokenDenylistService, TokenJti } from "./token-denylist.service"

const JTI = "550e8400-e29b-41d4-a716-446655440000" as TokenJti

describe("TokenDenylistService", () => {
  let service: TokenDenylistService
  let cache: jest.Mocked<Cache>
  let jwtService: { decode: jest.Mock }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenDenylistService,
        {
          provide: CACHE_MANAGER,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
          },
        },
        { provide: JwtService, useValue: { decode: jest.fn() } },
      ],
    }).compile()

    service = module.get<TokenDenylistService>(TokenDenylistService)
    cache = module.get(CACHE_MANAGER)
    jwtService = module.get(JwtService) as unknown as { decode: jest.Mock }
  })

  describe("decodeJti (issue #510)", () => {
    it("returns the branded jti from a token payload", () => {
      jwtService.decode.mockReturnValue({ jti: JTI, sub: 1 })

      const result = service.decodeJti("a.token.here")

      expect(jwtService.decode).toHaveBeenCalledWith("a.token.here")
      expect(result).toBe(JTI)
    })

    it("throws when the token has no jti claim (legacy token)", () => {
      jwtService.decode.mockReturnValue({ sub: 1 })

      expect(() => service.decodeJti("legacy.token")).toThrow(
        UnauthorizedException,
      )
      expect(() => service.decodeJti("legacy.token")).toThrow(
        "token has no jti claim and cannot be revoked",
      )
    })

    it("throws when the token cannot be decoded", () => {
      jwtService.decode.mockReturnValue(null)

      expect(() => service.decodeJti("garbage")).toThrow(UnauthorizedException)
    })
  })

  describe("revoke", () => {
    it("calls cache.set with a SHA-256 hash of the jti", async () => {
      const expectedHash = createHash("sha256").update(JTI).digest("hex")

      await service.revoke(JTI, 3600)

      expect(cache.set).toHaveBeenCalledWith(
        `jwt-denylist:${expectedHash}`,
        true,
        3600,
      )
    })

    it("does not call cache.set when ttlSeconds is zero", async () => {
      await service.revoke(JTI, 0)
      expect(cache.set).not.toHaveBeenCalled()
    })

    it("does not call cache.set when ttlSeconds is negative", async () => {
      await service.revoke(JTI, -1)
      expect(cache.set).not.toHaveBeenCalled()
    })
  })

  describe("isRevoked", () => {
    it("returns true when the jti is revoked", async () => {
      const expectedHash = createHash("sha256").update(JTI).digest("hex")
      cache.get.mockResolvedValue(true)

      const result = await service.isRevoked(JTI)

      // Reads the identical key revoke() wrote — this is the fix for the
      // revoke(rawToken) vs isRevoked(jti) mismatch (issue #510).
      expect(cache.get).toHaveBeenCalledWith(`jwt-denylist:${expectedHash}`)
      expect(result).toBe(true)
    })

    it("returns false when the jti is not revoked", async () => {
      cache.get.mockResolvedValue(false)

      const result = await service.isRevoked(JTI)

      expect(result).toBe(false)
    })

    it("returns false when cache returns null", async () => {
      cache.get.mockResolvedValue(null)

      const result = await service.isRevoked(JTI)

      expect(result).toBe(false)
    })
  })
})
