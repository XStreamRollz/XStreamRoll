import { Module } from "@nestjs/common"
import { GatewaysModule } from "./gateways/gateways.module"
import { HealthController } from "./health/health.controller"

@Module({
  imports: [GatewaysModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
