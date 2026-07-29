import { Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { AuthModule } from "../auth/auth.module"
import { AuthGuard } from "../common/guards/auth.guard"
import { StreamOwnershipService } from "../common/guards/stream-ownership.service"
import { WebhookDeliveriesDbRepository } from "./repository/webhook-deliveries-db.repository"
import { WebhookDeliveriesRepository } from "./repository/webhook-deliveries.repository"
import { WebhookSubscriptionsDbRepository } from "./repository/webhook-subscriptions-db.repository"
import { WebhookSubscriptionsRepository } from "./repository/webhook-subscriptions.repository"
import { WebhooksController } from "./webhooks.controller"
import { WebhooksService } from "./webhooks.service"

/**
 * Injection token used to swap the webhooks repository implementations.
 *
 * - Production / staging: the `*DbRepository` classes (PostgreSQL)
 * - Unit tests: the in-memory repositories
 */
const isTest = process.env.NODE_ENV === "test"

@Module({
  imports: [AuthModule, ScheduleModule.forRoot()],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    StreamOwnershipService,
    {
      provide: WebhookSubscriptionsRepository,
      useClass: isTest
        ? WebhookSubscriptionsRepository
        : WebhookSubscriptionsDbRepository,
    },
    {
      provide: WebhookDeliveriesRepository,
      useClass: isTest
        ? WebhookDeliveriesRepository
        : WebhookDeliveriesDbRepository,
    },
    AuthGuard,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
