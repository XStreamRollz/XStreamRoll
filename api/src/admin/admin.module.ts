import { CacheModule } from "@nestjs/cache-manager"
import { Module } from "@nestjs/common"
import { AuthModule } from "../auth/auth.module"
import { adminCacheConfig } from "../config/cache.config"
import { RolesGuard } from "../common/auth/roles.guard"
import { AuthGuard } from "../common/guards/auth.guard"
import { AdminStatsService } from "./admin-stats.service"
import { AdminController } from "./admin.controller"

@Module({
  imports: [
    CacheModule.register(adminCacheConfig()),
    AuthModule,
  ],
  controllers: [AdminController],
  providers: [AdminStatsService, RolesGuard, AuthGuard],
})
export class AdminModule {}