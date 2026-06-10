import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { AdminModule } from "./admin/admin.module"
import { AuditModule } from "./audit/audit.module"
import { AuthModule } from "./auth/auth.module"
import { GatewaysModule } from "./gateways/gateways.module"
import { HealthModule } from "./health/health.module"
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
    AuthModule,
    GatewaysModule,
    HealthModule,
    TagsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
