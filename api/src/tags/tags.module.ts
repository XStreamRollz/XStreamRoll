import { Module } from "@nestjs/common"
import { StreamOwnershipGuard } from "../common/guards/stream-ownership.guard"
import { StreamOwnershipService } from "../common/guards/stream-ownership.service"
import { TagsDbRepository } from "./repository/tags-db.repository"
import { TagsRepository } from "./repository/tags.repository"
import { StreamTagsController, TagsListController } from "./tags.controller"
import { TagsService } from "./tags.service"

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
  ],
  exports: [TagsService],
})
export class TagsModule {}
