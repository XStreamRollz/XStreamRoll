import { Inject, Injectable } from "@nestjs/common"
import { CACHE_MANAGER } from "@nestjs/cache-manager"
import { Cache } from "cache-manager"

const DENYLIST_PREFIX = "jwt-denylist:"

/**
 * Minimal value stored for a revoked token. The denylist is keyed on the
 * token's `jti` (a 36-char UUID) rather than the full JWT, so the value only
 * needs to flag that the id is revoked. We keep it a single boolean instead
 * of storing the token itself — Redis memory is a premium resource.
 */
const REVOKED_MARKER = true

@Injectable()
export class TokenDenylistService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /**
   * Add a token's `jti` to the denylist for the remainder of its lifetime.
   *
   * @param jti        The JWT ID of the revoked token (short UUID).
   * @param ttlSeconds Seconds until the token's `exp` claim. Used as the
   *                   cache TTL so the entry expires together with the token.
   */
  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return
    }

    const key = this.cacheKey(jti)
    await this.cache.set(key, REVOKED_MARKER, ttlSeconds)
  }

  async isRevoked(jti: string): Promise<boolean> {
    const key = this.cacheKey(jti)
    return (await this.cache.get<boolean>(key)) === REVOKED_MARKER
  }

  private cacheKey(jti: string): string {
    return `${DENYLIST_PREFIX}${jti}`
  }
}
