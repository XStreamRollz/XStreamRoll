import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common"

import { RolesGuard } from "./roles.guard"
import { AuthGuard } from "../guards/auth.guard"

/**
 * Shared guard composition for the admin surface: authenticate first,
 * then enforce the `admin` role.
 *
 * Both `AdminController` (`/admin/stats`) and `AdminAuditController`
 * (`/admin/audit-logs`) are gated by this single guard so the auth and
 * role layers can never drift apart again (issue #511 — the audit
 * controller previously ran `RolesGuard` with no upstream `AuthGuard`,
 * which let a bare `X-Roles: admin` header read the audit log).
 *
 *   @UseGuards(AdminGuard)
 *   @Roles("admin")
 *   @Controller("admin")
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly authGuard: AuthGuard,
    private readonly rolesGuard: RolesGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // AuthGuard throws UnauthorizedException on any authentication
    // failure and populates req.user.roles from the token's isAdmin
    // claim; RolesGuard then denies (403) non-admin identities.
    await this.authGuard.canActivate(context)
    return this.rolesGuard.canActivate(context)
  }
}
