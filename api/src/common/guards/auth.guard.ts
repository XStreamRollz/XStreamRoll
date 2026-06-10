import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import type { Request } from "express"

/**
 * Lightweight auth guard that extracts the authenticated user id from the
 * `X-User-Id` header. This is a placeholder until the full JWT auth
 * pipeline lands — at that point the guard will read `req.user.sub`
 * instead.
 *
 * Apply with `@UseGuards(AuthGuard)` on controllers or individual
 * handlers that require authentication.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()

    const rawUserId = (req.header("x-user-id") ?? "").trim()
    if (!rawUserId) {
      throw new UnauthorizedException(
        "X-User-Id header is required (placeholder until JWT auth lands)",
      )
    }
    const userId = Number(rawUserId)
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException("X-User-Id must be a positive integer")
    }

    // Stash on the request so downstream handlers / guards can access
    // the authenticated user without re-parsing.
    ;(req as Request & { auth?: { userId: number } }).auth = { userId }
    return true
  }
}
