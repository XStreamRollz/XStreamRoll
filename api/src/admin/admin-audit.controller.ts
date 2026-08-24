import { Controller, Get, Query, UseGuards } from "@nestjs/common"

import { AuditService } from "../audit/audit.service"
import { AdminGuard } from "../common/auth/admin.guard"
import { Roles } from "../common/auth/roles.guard"
import { PaginationQueryDto } from "../common/dto/pagination.dto"

/**
 * Admin-only audit log reader.
 *
 * Guarded by the same {@link AdminGuard} composition as `AdminController`
 * (issue #511): authentication runs first, then the `admin` role is
 * enforced from the JWT's `isAdmin` claim. A bare `X-Roles: admin`
 * header is never honored.
 */
@Controller("admin/audit-logs")
@UseGuards(AdminGuard)
@Roles("admin")
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findAll(@Query() query: PaginationQueryDto) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    return this.auditService.findAll(page, limit)
  }
}
