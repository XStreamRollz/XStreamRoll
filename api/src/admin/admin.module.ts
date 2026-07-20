import { CacheModule } from "@nestjs/cache-manager"
import { Module } from "@nestjs/common"
import { AuthModule } from "../auth/auth.module"
import { AuthGuard } from "../common/guards/auth.guard"
import { RolesGuard } from "../common/auth/roles.guard"
import { AdminStatsService } from "./admin-stats.service"
import { AdminController } from "./admin.controller"

@Module({
  imports: [
    CacheModule.register({
      // In-memory store; swap for cache-manager-redis-store once Redis
      // is part of the deployment stack.
      ttl: 60_000,
      max: 256,
    }),
    AuthModule,
  ],
  controllers: [AdminController],
  providers: [AdminStatsService, RolesGuard, AuthGuard],
})
export class AdminModule {}
