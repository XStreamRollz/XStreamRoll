import { CacheModule } from "@nestjs/cache-manager"
import { Module } from "@nestjs/common"

import { AdminAuditController } from "./admin-audit.controller"
import { AdminStatsService } from "./admin-stats.service"
import { AdminController } from "./admin.controller"
import { AuditModule } from "../audit/audit.module"
import { AuthModule } from "../auth/auth.module"
import { AdminGuard } from "../common/auth/admin.guard"
import { RolesGuard } from "../common/auth/roles.guard"
import { AuthGuard } from "../common/guards/auth.guard"
import { adminCacheConfig } from "../config/cache.config"

@Module({
  imports: [
    CacheModule.register(adminCacheConfig()),
    AuthModule,
    AuditModule,
  ],
  controllers: [AdminController, AdminAuditController],
  providers: [AdminStatsService, AdminGuard, RolesGuard, AuthGuard],
})
export class AdminModule {}
