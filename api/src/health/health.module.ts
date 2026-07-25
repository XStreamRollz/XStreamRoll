import { Module } from "@nestjs/common"
import { TerminusModule } from "@nestjs/terminus"
import { DatabaseHealthIndicator } from "./database.health-indicator"
import { HealthController } from "./health.controller"
import { MemoryHealthIndicator } from "./memory.health-indicator"

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, MemoryHealthIndicator],
})
export class HealthModule {}
