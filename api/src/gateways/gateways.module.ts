import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"
import createJwtConfig from "../config/jwt.config"
import { MetricsModule } from "../metrics/metrics.module"
import { StreamsGateway } from "./streams.gateway"

/**
 * Bundles the WebSocket gateway(s) together with the JwtModule used to
 * verify handshake tokens. JWT secret is loaded from the JWT_SECRET
 * environment variable; a dev-only fallback keeps local boots painless
 * while still surfacing the requirement loudly in production logs.
 */
@Module({
  imports: [
    MetricsModule,
    JwtModule.registerAsync({
      useFactory: () => createJwtConfig("1h"),
    }),
  ],
  providers: [StreamsGateway],
  exports: [StreamsGateway],
})
export class GatewaysModule {}
