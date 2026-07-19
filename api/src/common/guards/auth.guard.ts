import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import type { Request } from "express"
import { TokenDenylistService } from "../../auth/token-denylist.service"
import { UsersRepository } from "../../auth/users.repository"

/**
 * Auth guard that validates a JWT access token from the Authorization header
 * and rejects revoked tokens.
 *
 * Apply with `@UseGuards(AuthGuard)` on controllers or individual
 * handlers that require authentication.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tokenDenylistService: TokenDenylistService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const token = this.extractBearerToken(req.header("authorization") ?? "")

    const payload = await this.verifyToken(token)

    // Denylist lookup is keyed on the verified token's `jti` (a short UUID),
    // giving an O(1) cache lookup without hashing or storing the full token.
    // Tokens issued before the `jti` claim existed are skipped here and
    // expire naturally.
    const jti = payload.jti
    if (typeof jti === "string" && jti.length > 0) {
      if (await this.tokenDenylistService.isRevoked(jti)) {
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

    ;(req as Request & { auth?: { userId: number } }).auth = { userId }
    return true
  }

  private async verifyToken(
    token: string,
  ): Promise<{ sub: number | string; jti?: string }> {
    try {
      return (await this.jwtService.verifyAsync(token)) as {
        sub: number | string
        jti?: string
  ): Promise<{ sub: number | string; passwordChangedAt?: number }> {
    try {
      return (await this.jwtService.verifyAsync(token)) as {
        sub: number | string
        passwordChangedAt?: number
      }
    } catch {
      throw new UnauthorizedException("invalid or expired access token")
    }
  }

  private extractBearerToken(header: string): string {
    const match = header.trim().match(/^Bearer\s+(.+)$/i)
    if (!match) {
      throw new UnauthorizedException(
        "Authorization header must contain a Bearer token",
      )
    }
    return match[1]
  }
}
