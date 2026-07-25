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

    if (await this.tokenDenylistService.isRevoked(token)) {
      throw new UnauthorizedException("access token has been revoked")
    }

    const payload = await this.verifyToken(token)
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

    const authenticatedReq = req as Request & {
      auth?: { userId: number }
      user?: { sub: number; roles: string[] }
    }
    authenticatedReq.auth = { userId }
    authenticatedReq.user = { sub: userId, roles: [] }
    return true
  }

  private async verifyToken(
    token: string,
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
