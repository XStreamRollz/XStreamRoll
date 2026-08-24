import { Module } from "@nestjs/common"

import { StreamsGateway } from "./streams.gateway"
import { AuthModule } from "../auth/auth.module"
import { MetricsModule } from "../metrics/metrics.module"

/**
 * Bundles the WebSocket gateway(s). Handshake authentication routes
 * through `JwtExtractorService` (provided by AuthModule) so socket
 * connections run the exact same verification, denylist, and
 * password-change checks as the REST guards.
 */
@Module({
  imports: [MetricsModule, AuthModule],
  providers: [StreamsGateway],
  exports: [StreamsGateway],
})
export class GatewaysModule {}
