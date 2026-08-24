import { createHash } from "crypto"

import { CACHE_MANAGER } from "@nestjs/cache-manager"
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { Cache } from "cache-manager"

const DENYLIST_PREFIX = "jwt-denylist:"

/**
 * A token's `jti` (JWT ID) claim — the ONLY key the denylist accepts.
 *
 * Branded so `revoke()` / `isRevoked()` cannot be fed a raw JWT string:
 * the historical bug (issue #510) was that `revoke(rawToken)` and
 * `isRevoked(jti)` hashed different values, so the keys never matched
 * and no revocation ever took effect. Obtain a value via
 * {@link TokenDenylistService.decodeJti} — that is the only place a
 * `TokenJti` can be created, so the mismatch becomes impossible at the
 * type level.
 */
export type TokenJti = string & { readonly __tokenJti: unique symbol }

/**
 * Minimal value stored for a revoked token. The denylist is keyed on the
 * token's `jti` (a 36-char UUID) rather than the full JWT, so the value only
 * needs to flag that the id is revoked. We keep it a single boolean instead
 * of storing the token itself — Redis memory is a premium resource.
 */
const REVOKED_MARKER = true

@Injectable()
export class TokenDenylistService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Decode a JWT and return its branded `jti`. This is the only way to
   * obtain a {@link TokenJti}, so callers cannot accidentally revoke a
   * raw token string.
   *
   * @throws UnauthorizedException when the token carries no `jti` claim
   *         (legacy tokens minted before the jti claim existed cannot be
   *         revoked — they expire naturally).
   */
  decodeJti(token: string): TokenJti {
    const payload = this.jwtService.decode(token) as { jti?: unknown } | null
    if (typeof payload?.jti !== "string" || payload.jti.length === 0) {
      throw new UnauthorizedException(
        "token has no jti claim and cannot be revoked",
      )
    }
    return payload.jti as TokenJti
  }

  /**
   * Add a token's `jti` to the denylist for the remainder of its lifetime.
   *
   * The cache key is a SHA-256 hash of the `jti` — the exact same key
   * {@link isRevoked} reads — so a token revoked here is rejected there.
   *
   * @param jti        The JWT ID of the revoked token (branded — see
   *                   {@link TokenJti}).
   * @param ttlSeconds Seconds until the token's `exp` claim. Used as the
   *                   cache TTL so the entry expires together with the token.
   */
  async revoke(jti: TokenJti, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return
    }

    const key = this.cacheKey(jti)
    await this.cache.set(key, REVOKED_MARKER, ttlSeconds)
  }

  async isRevoked(jti: TokenJti): Promise<boolean> {
    const key = this.cacheKey(jti)
    return (await this.cache.get<boolean>(key)) === REVOKED_MARKER
  }

  private cacheKey(jti: string): string {
    const hash = createHash("sha256").update(jti).digest("hex")
    return `${DENYLIST_PREFIX}${hash}`
  }
}
