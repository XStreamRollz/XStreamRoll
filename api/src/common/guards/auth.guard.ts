import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common"

import { JwtExtractorService } from "./jwt-extractor.service"

import type { Request } from "express"

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
    const { userId, isAdmin } = await this.jwtExtractor.authenticate(
      req.header("authorization"),
    )

    const authenticatedReq = req as Request & {
      auth?: { userId: number }
      user?: { sub: number; roles: string[] }
    }
    authenticatedReq.auth = { userId }
    // Issue #511: roles are derived exclusively from the token's isAdmin
    // claim — never from request headers. A token without the claim yields
    // an empty role set, so RolesGuard denies admin-gated routes.
    authenticatedReq.user = { sub: userId, roles: isAdmin ? ["admin"] : [] }
    return true
  }
}
