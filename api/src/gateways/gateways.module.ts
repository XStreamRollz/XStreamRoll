import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"
import { StreamsGateway } from "./streams.gateway"

/**
 * Bundles the WebSocket gateway(s) together with the JwtModule used to
 * verify handshake tokens. JWT secret is loaded from the JWT_SECRET
 * environment variable; a dev-only fallback keeps local boots painless
 * while still surfacing the requirement loudly in production logs.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET
        if (!secret && process.env.NODE_ENV === "production") {
          throw new Error(
            "JWT_SECRET must be set in production for WebSocket auth",
          )
        }
        return {
          secret: secret ?? "dev-insecure-secret-change-me",
          signOptions: { expiresIn: "1h" },
        }
      },
    }),
  ],
  providers: [StreamsGateway],
  exports: [StreamsGateway],
})
export class GatewaysModule {}
