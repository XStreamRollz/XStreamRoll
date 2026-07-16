import { TokenDenylistService } from "./token-denylist.service"
import { randomUUID } from "node:crypto"

interface MockCache {
  set: jest.Mock<Promise<void>>
  get: jest.Mock<Promise<unknown>>
}

function makeService(cache: MockCache): TokenDenylistService {
  return new TokenDenylistService(cache as unknown as any)
}

describe("TokenDenylistService", () => {
  let cache: MockCache
  let service: TokenDenylistService

  beforeEach(() => {
    cache = { set: jest.fn().mockResolvedValue(undefined), get: jest.fn() }
    service = makeService(cache)
    jest.clearAllMocks()
  })

  describe("revoke", () => {
    it("stores a compact marker keyed by the jti with the given ttl", async () => {
      const jti = randomUUID()
      await service.revoke(jti, 300)

      expect(cache.set).toHaveBeenCalledTimes(1)
      expect(cache.set).toHaveBeenCalledWith("jwt-denylist:" + jti, true, 300)
    })

    it("does not write when the ttl is zero or negative", async () => {
      await service.revoke(randomUUID(), 0)
      await service.revoke(randomUUID(), -5)

      expect(cache.set).not.toHaveBeenCalled()
    })
  })

  describe("isRevoked", () => {
    it("returns true when the jti carries the revocation marker", async () => {
      const jti = randomUUID()
      cache.get.mockResolvedValue(true)

      expect(await service.isRevoked(jti)).toBe(true)
      expect(cache.get).toHaveBeenCalledWith("jwt-denylist:" + jti)
    })

    it("returns false when the jti is not present", async () => {
      const jti = randomUUID()
      cache.get.mockResolvedValue(undefined)

      expect(await service.isRevoked(jti)).toBe(false)
    })

    it("returns false when the stored value is not the marker", async () => {
      const jti = randomUUID()
      cache.get.mockResolvedValue("not-a-marker")

      expect(await service.isRevoked(jti)).toBe(false)
    })
  })
})
