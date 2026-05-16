import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { AdminModule } from "./admin/admin.module"
import { AuditModule } from "./audit/audit.module"
import { GatewaysModule } from "./gateways/gateways.module"
import { HealthController } from "./health/health.controller"
import { TagsModule } from "./tags/tags.module"

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL ?? "60000"),
        limit: parseInt(process.env.THROTTLE_LIMIT ?? "100"),
      },
    ]),
    AdminModule,
    AuditModule,
    GatewaysModule,
    TagsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
