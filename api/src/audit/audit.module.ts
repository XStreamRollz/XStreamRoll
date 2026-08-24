import { Module } from "@nestjs/common"
import { APP_INTERCEPTOR } from "@nestjs/core"

import { AdminAuditController } from "./admin-audit.controller"
import { AuditInterceptor } from "./audit.interceptor"
import { AuditService } from "./audit.service"
import { MetricsModule } from "../metrics/metrics.module"

/**
 * Audit logging module.
 *
 * Fail-open policy (issue #530): audit log writes must never fail the
 * primary request they are auditing. A DB hiccup on the audit table
 * must not turn a valid login into a 503. `AuditService.logSafely`
 * absorbs write failures (structured log + `audit_log_write_failures_total`
 * metric) so security-relevant events stay observable while the
 * audited action proceeds — a deliberate trade-off between audit
 * coverage and product availability. The interceptor and the auth
 * service both route through the safe path.
 */
@Module({
  imports: [MetricsModule],
  controllers: [AdminAuditController],
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
