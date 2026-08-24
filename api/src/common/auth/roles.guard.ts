import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import type { Request } from "express"

export const ROLES_METADATA_KEY = "auth:roles"

/**
 * Controller / handler decorator declaring the roles that are allowed
 * to invoke the annotated endpoint.
 *
 *   @Roles("admin")
 *   @UseGuards(AdminGuard)
 *   @Get("stats")
 *   stats() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_METADATA_KEY, roles)

interface AuthenticatedRequest extends Request {
  user?: { sub: string | number; roles?: string[] }
}

/**
 * Role-based access control.
 *
 * Roles are read exclusively from `req.user.roles`, which an upstream
 * auth guard ({@link AuthGuard}) populates from the verified JWT's
 * `isAdmin` claim. A request without `req.user` is rejected with 401 —
 * there is no header-based fallback, so a bare `X-Roles: admin` header
 * can never grant access. Compose with {@link AdminGuard} (or an
 * `AuthGuard` + this guard pair) on any handler that declares `@Roles`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    )

    // No @Roles() declared → guard is a no-op. Lets controllers compose
    // RolesGuard for some handlers while leaving others public.
    if (!required || required.length === 0) return true

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>()

    // Authentication must have run first (AuthGuard). Without an
    // authenticated user there is no identity to authorize — treat this
    // as 401, not 403, so unauthenticated callers can't probe role
    // requirements.
    if (!req.user) {
      throw new UnauthorizedException("authentication required")
    }

    const granted = required.some((r) => req.user?.roles?.includes(r))
    if (!granted) {
      throw new ForbiddenException(
        `requires one of role(s): ${required.join(", ")}`,
      )
    }
    return true
  }
}
