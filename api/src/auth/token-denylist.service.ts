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
    await this.cache.set(key, true, { ttl: ttlSeconds })
  }

  async isRevoked(token: string): Promise<boolean> {
    const key = this.cacheKey(token)
    return (await this.cache.get<boolean>(key)) === true
  }

  private cacheKey(token: string): string {
    return `${DENYLIST_PREFIX}${token}`
  }
}
