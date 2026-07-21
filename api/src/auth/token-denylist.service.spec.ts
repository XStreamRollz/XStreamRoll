import { createHash } from "crypto"
import { Test, TestingModule } from "@nestjs/testing"
import { CACHE_MANAGER } from "@nestjs/cache-manager"
import { Cache } from "cache-manager"
import { TokenDenylistService } from "./token-denylist.service"

describe("TokenDenylistService", () => {
  let service: TokenDenylistService
  let cache: jest.Mocked<Cache>

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
      ],
    }).compile()

    service = module.get<TokenDenylistService>(TokenDenylistService)
    cache = module.get(CACHE_MANAGER)
  })

  describe("revoke", () => {
    it("calls cache.set with a SHA-256 hashed key", async () => {
      const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"
      const expectedHash = createHash("sha256").update(token).digest("hex")

      await service.revoke(token, 3600)

      expect(cache.set).toHaveBeenCalledWith(
        `jwt-denylist:${expectedHash}`,
        true,
        3600,
      )
    })

    it("does not call cache.set when ttlSeconds is zero", async () => {
      await service.revoke("some-token", 0)
      expect(cache.set).not.toHaveBeenCalled()
    })

    it("does not call cache.set when ttlSeconds is negative", async () => {
      await service.revoke("some-token", -1)
      expect(cache.set).not.toHaveBeenCalled()
    })
  })

  describe("isRevoked", () => {
    it("returns true when the token is revoked", async () => {
      const token = "some-token"
      const expectedHash = createHash("sha256").update(token).digest("hex")
      cache.get.mockResolvedValue(true)

      const result = await service.isRevoked(token)

      expect(cache.get).toHaveBeenCalledWith(`jwt-denylist:${expectedHash}`)
      expect(result).toBe(true)
    })

    it("returns false when the token is not revoked", async () => {
      cache.get.mockResolvedValue(false)

      const result = await service.isRevoked("some-token")

      expect(result).toBe(false)
    })

    it("returns false when cache returns null", async () => {
      cache.get.mockResolvedValue(null)

      const result = await service.isRevoked("some-token")

      expect(result).toBe(false)
    })
  })
})
