import { Module } from "@nestjs/common"
import { StreamOwnershipGuard } from "../common/guards/stream-ownership.guard"
import { StreamOwnershipService } from "../common/guards/stream-ownership.service"
import { TagsRepository } from "./repository/tags.repository"
import { StreamTagsController, TagsListController } from "./tags.controller"
import { TagsService } from "./tags.service"

@Module({
  controllers: [TagsListController, StreamTagsController],
  providers: [
    TagsService,
    TagsRepository,
    StreamOwnershipGuard,
    StreamOwnershipService,
  ],
  exports: [TagsService],
})
export class TagsModule {}
