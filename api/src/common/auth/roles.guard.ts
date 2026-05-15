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
 *   @UseGuards(RolesGuard)
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
 * The guard expects an upstream auth layer (JWT strategy, session, etc.)
 * to populate `req.user.roles`. Until that lands the guard supports a
 * dev-only fallback: if the request is missing `req.user` it inspects
 * the `X-Roles` header (comma-separated list) so endpoints can still be
 * exercised locally. Production deployments MUST set
 * \`ALLOW_HEADER_ROLES=0\` to disable this fallback.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly headerFallbackEnabled = process.env.ALLOW_HEADER_ROLES !== "0"

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
    const roles = this.extractRoles(req)
    if (!roles) {
      throw new UnauthorizedException("authentication required")
    }

    const granted = required.some((r) => roles.includes(r))
    if (!granted) {
      throw new ForbiddenException(
        `requires one of role(s): ${required.join(", ")}`,
      )
    }
    return true
  }

  private extractRoles(req: AuthenticatedRequest): string[] | null {
    if (req.user && Array.isArray(req.user.roles)) {
      return req.user.roles
    }
    if (!this.headerFallbackEnabled) return null

    const header = req.header("x-roles")
    if (!header) return null
    return header
      .split(",")
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean)
  }
}
