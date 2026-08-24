import { Module } from "@nestjs/common"
import { APP_INTERCEPTOR } from "@nestjs/core"

import { AuditInterceptor } from "./audit.interceptor"
import { AuditService } from "./audit.service"

@Module({
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
