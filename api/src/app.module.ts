import { Module } from "@nestjs/common"
import { HealthController } from "./health/health.controller"
import { AuditModule } from "./audit/audit.module"

@Module({
  imports: [AuditModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
