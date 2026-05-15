import { Module } from "@nestjs/common"
import { AdminModule } from "./admin/admin.module"
import { HealthController } from "./health/health.controller"

@Module({
  imports: [AdminModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
