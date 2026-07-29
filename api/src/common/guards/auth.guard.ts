import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common"
import type { Request } from "express"
import { JwtExtractorService } from "./jwt-extractor.service"

/**
 * Auth guard that validates a JWT access token from the Authorization header
 * and rejects revoked tokens.
 *
 * Apply with `@UseGuards(AuthGuard)` on controllers or individual
 * handlers that require authentication.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtExtractor: JwtExtractorService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const userId = await this.jwtExtractor.authenticate(
      req.header("authorization"),
    )

    const authenticatedReq = req as Request & {
      auth?: { userId: number }
      user?: { sub: number; roles: string[] }
    }
    authenticatedReq.auth = { userId }
    authenticatedReq.user = { sub: userId, roles: [] }
    return true
  }
}
