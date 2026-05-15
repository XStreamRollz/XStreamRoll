import { Controller, Get, Query } from "@nestjs/common"
import { AuditService } from "./audit.service"

@Controller("admin/audit-logs")
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @Query("limit") limit = "100",
    @Query("offset") offset = "0",
  ) {
    return this.auditService.findAll(parseInt(limit), parseInt(offset))
  }
}
