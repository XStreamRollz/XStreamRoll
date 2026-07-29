import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common"
import type { Request } from "express"
import { AuthGuard } from "./auth.guard"
import { StreamOwnershipService } from "./stream-ownership.service"

/**
 * Guard that ensures the requesting user owns the stream referenced by
 * the `:id` URL parameter.  Authentication is delegated to
 * {@link AuthGuard} so that every security fix applied there
 * (denylist checks, password-change invalidation, etc.) automatically
 * applies to ownership-gated routes as well.
 */
@Injectable()
export class StreamOwnershipGuard implements CanActivate {
  constructor(
    private readonly authGuard: AuthGuard,
    private readonly ownership: StreamOwnershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Delegate the full JWT authentication pipeline to AuthGuard.
    // It will throw UnauthorizedException on any auth failure.
    await this.authGuard.canActivate(context)

    const req = context.switchToHttp().getRequest<Request>()
    const userId = (req as Request & { auth?: { userId: number } }).auth?.userId

    if (userId === undefined) {
      throw new ForbiddenException("authentication required")
    }

    const rawStreamId = (req as Request & { params?: { id?: string } }).params
      ?.id
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

    return true
  }
}
