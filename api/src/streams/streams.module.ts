import { Module } from "@nestjs/common"
import { AuthGuard } from "../common/guards/auth.guard"
import { StreamOwnershipGuard } from "../common/guards/stream-ownership.guard"
import { StreamOwnershipService } from "../common/guards/stream-ownership.service"
import { StreamsRepository } from "./repository/streams.repository"
import { StreamsController } from "./streams.controller"
import { StreamsService } from "./streams.service"

@Module({
  controllers: [StreamsController],
  providers: [
    StreamsService,
    StreamsRepository,
    AuthGuard,
    StreamOwnershipGuard,
    StreamOwnershipService,
  ],
  exports: [StreamsService],
})
export class StreamsModule {}
