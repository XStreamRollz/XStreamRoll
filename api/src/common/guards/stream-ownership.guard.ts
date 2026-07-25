import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import type { Request } from "express"
import { TokenDenylistService } from "../../auth/token-denylist.service"
import { StreamOwnershipService } from "./stream-ownership.service"

/**
 * Guard that ensures the requesting user owns the stream referenced by
 * the `:id` URL parameter. Authentication is performed by validating the
 * JWT from the Authorization header and rejecting revoked tokens.
 */
@Injectable()
export class StreamOwnershipGuard implements CanActivate {
  constructor(
    private readonly ownership: StreamOwnershipService,
    private readonly jwtService: JwtService,
    private readonly tokenDenylistService: TokenDenylistService,
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

    const rawStreamId = req.params?.id
    const streamId = Number(rawStreamId)
    if (!Number.isInteger(streamId) || streamId <= 0) {
      throw new ForbiddenException("invalid stream id")
    }

    const owns = await this.ownership.ownsStream(userId, streamId)
    if (!owns) {
      throw new ForbiddenException(
        `user ${userId} does not own stream ${streamId}`,
      )
    }

    ;(req as Request & { auth?: { userId: number } }).auth = { userId }
    return true
  }

  private async verifyToken(token: string): Promise<{ sub: number | string }> {
    try {
      return (await this.jwtService.verifyAsync(token)) as {
        sub: number | string
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
