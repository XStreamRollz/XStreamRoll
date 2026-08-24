import { Injectable, UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"

import {
  TokenDenylistService,
  TokenJti,
} from "../../auth/token-denylist.service"
import { UsersRepository } from "../../auth/users.repository"

/**
 * Extracts and validates a JWT bearer token from the Authorization header.
 *
 * Centralises the duplicated verification logic that previously lived in
 * both {@link AuthGuard} and {@link StreamOwnershipGuard} so that security
 * fixes apply consistently to every guard that composes with this service.
 */
@Injectable()
export class JwtExtractorService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tokenDenylistService: TokenDenylistService,
    private readonly usersRepository: UsersRepository,
  ) {}

  /**
   * Full authentication pipeline:
   *   1. Extract the Bearer token from the Authorization header.
   *   2. Verify the JWT signature and expiry.
   *   3. Check the token's `jti` against the denylist.
   *   4. Validate the `sub` claim resolves to a positive integer.
   *   5. Reject tokens minted before the user's last password change.
   *
   * @returns The authenticated user's id and admin flag. The admin flag is
   *          read from the token's `isAdmin` claim and defaults to `false`
   *          for tokens minted before the claim existed, so legacy tokens
   *          can never grant admin access.
   * @throws UnauthorizedException at any step when credentials are invalid.
   */
  async authenticate(header: string | undefined): Promise<{
    userId: number
    isAdmin: boolean
  }> {
    const token = this.extractBearerToken(header ?? "")
    const payload = await this.verifyToken(token)

    // Denylist lookup is keyed on the verified token's `jti` (a short UUID),
    // giving an O(1) cache lookup without hashing or storing the full token.
    // Tokens issued before the `jti` claim existed are skipped here and
    // expire naturally.
    const jti = payload.jti
    if (typeof jti === "string" && jti.length > 0) {
      // The verified payload's jti is a TokenJti by construction.
      if (await this.tokenDenylistService.isRevoked(jti as TokenJti)) {
        throw new UnauthorizedException("access token has been revoked")
      }
    }

    const userId = Number(payload.sub)
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException("invalid access token")
    }

    const tokenPwdChangedAt =
      (payload as { passwordChangedAt?: number }).passwordChangedAt ?? 0
    if (tokenPwdChangedAt > 0) {
      const user = await this.usersRepository.findById(userId)
      if (!user) {
        throw new UnauthorizedException("user not found")
      }
      const actualPwdChangedAt =
        user.password_changed_at?.getTime() ?? user.created_at.getTime()
      if (tokenPwdChangedAt < actualPwdChangedAt) {
        throw new UnauthorizedException(
          "access token is no longer valid, please log in again",
        )
      }
    }

    return {
      userId,
      // Default to false: tokens issued before the isAdmin claim existed
      // (or tokens for users since demoted without re-login) must never
      // carry admin privileges.
      isAdmin: (payload as { isAdmin?: unknown }).isAdmin === true,
    }
  }

  /**
   * Extracts the raw token from a `Bearer <token>` header value.
   *
   * @throws UnauthorizedException when the header is missing or malformed.
   */
  extractBearerToken(header: string): string {
    const match = header.trim().match(/^Bearer\s+(.+)$/i)
    if (!match) {
      throw new UnauthorizedException(
        "Authorization header must contain a Bearer token",
      )
    }
    return match[1]
  }

  private async verifyToken(token: string): Promise<{
    sub: number | string
    jti?: string
    passwordChangedAt?: number
  }> {
    try {
      return (await this.jwtService.verifyAsync(token)) as {
        sub: number | string
        jti?: string
        passwordChangedAt?: number
      }
    } catch {
      throw new UnauthorizedException("invalid or expired access token")
    }
  }
}
