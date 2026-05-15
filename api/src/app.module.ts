import { Module } from "@nestjs/common"
import { HealthController } from "./health/health.controller"
import { TagsModule } from "./tags/tags.module"

@Module({
  imports: [TagsModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
