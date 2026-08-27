import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { TagsDbRepository } from "./repository/tags-db.repository"
import { TagsRepository } from "./repository/tags.repository"
import { StreamTagsController, TagsListController } from "./tags.controller"
import { TagsService } from "./tags.service"
import { AuthGuard } from "../common/guards/auth.guard"
import { StreamOwnershipGuard } from "../common/guards/stream-ownership.guard"
import { StreamOwnershipService } from "../common/guards/stream-ownership.service"

/**
 * Injection token used to swap the tags repository implementation.
 *
 * - Production / staging: {@link TagsDbRepository} (PostgreSQL)
 * - Unit tests: {@link TagsRepository} (in-memory) or a mock
 *
 * To use the in-memory implementation in a test module:
 * ```ts
 * { provide: TagsRepository, useClass: TagsRepository }
 * ```
 */
const isTest = process.env.NODE_ENV === "test"

@Module({
  imports: [AuthModule],
  controllers: [TagsListController, StreamTagsController],
  providers: [
    TagsService,
    // Swap repository based on environment.
    // Tests run against the in-memory implementation; everything else
    // uses the PostgreSQL-backed implementation.
    {
      provide: TagsRepository,
      useClass: isTest ? TagsRepository : TagsDbRepository,
    },
    StreamOwnershipGuard,
    StreamOwnershipService,
    AuthGuard,
  ],
  // TagsRepository is exported so StreamsModule's in-memory
  // StreamsRepository can resolve the same tag-association store and
  // apply the `tag` list filter (issue #532).
  exports: [TagsService, TagsRepository],
})
export class TagsModule {}
