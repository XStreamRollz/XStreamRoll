import { Module } from "@nestjs/common"
import { AuthModule } from "../auth/auth.module"
import { AuthGuard } from "../common/guards/auth.guard"
import { GatewaysModule } from "../gateways/gateways.module"
import { NotificationsController } from "./notifications.controller"
import { NotificationsService } from "./notifications.service"
import { NotificationsDbRepository } from "./repository/notifications-db.repository"
import { NotificationsRepository } from "./repository/notifications.repository"

/**
 * Injection token used to swap the notifications repository implementation.
 *
 * - Production / staging: {@link NotificationsDbRepository} (PostgreSQL)
 * - Unit tests: {@link NotificationsRepository} (in-memory) or a mock
 */
const isTest = process.env.NODE_ENV === "test"

@Module({
  imports: [AuthModule, GatewaysModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: NotificationsRepository,
      useClass: isTest ? NotificationsRepository : NotificationsDbRepository,
    },
    AuthGuard,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
