import { Module } from "@nestjs/common"

import { StreamsGateway } from "./streams.gateway"
import { AuthModule } from "../auth/auth.module"
import { MetricsModule } from "../metrics/metrics.module"
import { StreamOwnershipService } from "../common/guards/stream-ownership.service"

/**
 * Bundles the WebSocket gateway(s). Handshake authentication routes
 * through `JwtExtractorService` (provided by AuthModule) so socket
 * connections run the exact same verification, denylist, and
 * password-change checks as the REST guards.
 *
 * `StreamOwnershipService` is provided here so `StreamsGateway` can
 * enforce ownership / visibility on `stream:subscribe` (issue #520).
 */
@Module({
  imports: [MetricsModule, AuthModule],
  providers: [StreamsGateway, StreamOwnershipService],
  exports: [StreamsGateway],
})
export class GatewaysModule {}
