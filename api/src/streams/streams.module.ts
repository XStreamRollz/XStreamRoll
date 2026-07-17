import { CacheModule } from "@nestjs/cache-manager"
import { Module } from "@nestjs/common"
import { AuthModule } from "../auth/auth.module"
import { AuthGuard } from "../common/guards/auth.guard"
import { StreamOwnershipGuard } from "../common/guards/stream-ownership.guard"
import { StreamOwnershipService } from "../common/guards/stream-ownership.service"
import { StreamsDbRepository } from "./repository/streams-db.repository"
import { StreamsRepository } from "./repository/streams.repository"
import { StreamsController } from "./streams.controller"
import { StreamsService } from "./streams.service"

/**
 * Injection token used to swap the streams repository implementation.
 *
 * - Production / staging: {@link StreamsDbRepository} (PostgreSQL)
 * - Unit tests: {@link StreamsRepository} (in-memory) or a mock
 *
 * To use the in-memory implementation in a test module:
 * ```ts
 * { provide: StreamsRepository, useClass: StreamsRepository }
 * ```
 */
const isTest = process.env.NODE_ENV === "test"

@Module({
  imports: [
    AuthModule,
    CacheModule.register({
      ttl: 60_000,
      max: 512,
    }),
  ],
  controllers: [StreamsController],
  providers: [
    StreamsService,
    // Swap repository based on environment.
    // Tests run against the in-memory implementation; everything else
    // uses the PostgreSQL-backed implementation.
    {
      provide: StreamsRepository,
      useClass: isTest ? StreamsRepository : StreamsDbRepository,
    },
    AuthGuard,
    StreamOwnershipGuard,
    StreamOwnershipService,
  ],
  exports: [StreamsService],
})
export class StreamsModule {}
