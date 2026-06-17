import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { AdminModule } from "./admin/admin.module"
import { AuditModule } from "./audit/audit.module"
import { AuthModule } from "./auth/auth.module"
import { GatewaysModule } from "./gateways/gateways.module"
import { HealthModule } from "./health/health.module"
import { MetricsModule } from "./metrics/metrics.module"
import { RequestLoggerMiddleware } from "./middleware/request-logger.middleware"
import { StreamsModule } from "./streams/streams.module"
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
    MetricsModule,
    StreamsModule,
    TagsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  // Issue #57: Request logger runs for every route. Sits after Helmet/CORS
  // so it sees the final status code and content-length, and before any
  // audit interceptor that may want to consume the same request id.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*")
  }
}
