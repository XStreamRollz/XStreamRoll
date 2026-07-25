import { createHash } from "crypto"
import { Inject, Injectable } from "@nestjs/common"
import { CACHE_MANAGER } from "@nestjs/cache-manager"
import { Cache } from "cache-manager"

const DENYLIST_PREFIX = "jwt-denylist:"

@Injectable()
export class TokenDenylistService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async revoke(token: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return
    }

    const key = this.cacheKey(token)
    await this.cache.set(key, true, ttlSeconds)
  }

  async isRevoked(token: string): Promise<boolean> {
    const key = this.cacheKey(token)
    return (await this.cache.get<boolean>(key)) === true
  }

  private cacheKey(token: string): string {
    const hash = createHash("sha256").update(token).digest("hex")
    return `${DENYLIST_PREFIX}${hash}`
  }
}
