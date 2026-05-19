import { Controller, Get, Query } from "@nestjs/common"
import { AuditService } from "./audit.service"
import { PaginationQueryDto } from "../common/dto/pagination.dto"

@Controller("admin/audit-logs")
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findAll(@Query() query: PaginationQueryDto) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    return this.auditService.findAll(page, limit)
  }
}
