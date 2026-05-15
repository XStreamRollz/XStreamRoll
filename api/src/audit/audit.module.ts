import { Module } from "@nestjs/common"
import { APP_INTERCEPTOR } from "@nestjs/core"
import { AuditService } from "./audit.service"
import { AuditInterceptor } from "./audit.interceptor"
import { AdminAuditController } from "./admin-audit.controller"

@Module({
  controllers: [AdminAuditController],
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
