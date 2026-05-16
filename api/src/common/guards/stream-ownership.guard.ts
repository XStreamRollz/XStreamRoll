import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { Request } from "express"
import { StreamOwnershipService } from "./stream-ownership.service"

/**
 * Guard that ensures the requesting user owns the stream referenced by
 * the `:id` URL parameter. Until the JWT auth pipeline lands the
 * authenticated user id is sourced from the `X-User-Id` header; the
 * controller signature stays the same so the only thing that will need
 * updating later is *how* `userId` is extracted (e.g. `req.user.sub`).
 */
@Injectable()
export class StreamOwnershipGuard implements CanActivate {
  constructor(private readonly ownership: StreamOwnershipService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()

    const rawUserId = (req.header("x-user-id") ?? "").trim()
    if (!rawUserId) {
      throw new UnauthorizedException(
        "X-User-Id header is required (placeholder until JWT auth lands)",
      )
    }
    const userId = Number(rawUserId)
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException("X-User-Id must be a positive integer")
    }

    const rawStreamId = req.params?.id
    const streamId = Number(rawStreamId)
    if (!Number.isInteger(streamId) || streamId <= 0) {
      throw new ForbiddenException("invalid stream id")
    }

    const owns = await this.ownership.ownsStream(userId, streamId)
    if (!owns) {
      throw new ForbiddenException(
        `user ${userId} does not own stream ${streamId}`,
      )
    }

    // Stash on the request so downstream handlers can read the actor
    // without re-parsing the header.
    ;(req as Request & { auth?: { userId: number } }).auth = { userId }
    return true
  }
}
