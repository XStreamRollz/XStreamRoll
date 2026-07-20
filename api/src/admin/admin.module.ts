import { CacheModule } from "@nestjs/cache-manager"
import { Module } from "@nestjs/common"
import { adminCacheConfig } from "../config/cache.config"
import { RolesGuard } from "../common/auth/roles.guard"
import { AdminStatsService } from "./admin-stats.service"
import { AdminController } from "./admin.controller"

@Module({
  imports: [
    CacheModule.register(adminCacheConfig()),
  ],
  controllers: [AdminController],
  providers: [AdminStatsService, RolesGuard],
})
export class AdminModule {}
