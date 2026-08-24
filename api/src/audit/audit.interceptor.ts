import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common"
import { Request } from "express"
import { Observable, tap } from "rxjs"

import { AuditAction } from "./audit-action.enum"
import { AuditService } from "./audit.service"

/**
 * Routes the interceptor audits, keyed by the exact `METHOD path` the
 * router exposes. Only real routes may be listed here: a pattern for a
 * route that does not exist (e.g. `DELETE /streams` or `POST
 * /auth/password`) is dead configuration that silently records nothing
 * (issue #523).
 *
 * `POST /auth/login` is deliberately absent: `AuthService.login()` already
 * writes `AUTH_LOGIN_SUCCESS` / `AUTH_LOGIN_FAILURE` with full metadata,
 * and a second bare `login` row would double-log every login attempt.
 */
const SENSITIVE_ACTIONS: Record<string, AuditAction> = {
  "PATCH /users/me": AuditAction.PROFILE_UPDATE,
  "POST /users/me/change-password": AuditAction.PASSWORD_CHANGE,
}

/**
 * The real stream-delete route is `DELETE /streams/:id`, which carries a
 * path parameter and therefore cannot be an exact-match key above. The id
 * is validated as an integer by `ParseIntPipe`, so a numeric regex mirrors
 * the route precisely (a trailing slash is tolerated).
 */
const STREAM_DELETE_PATTERN = /^DELETE \/streams\/\d+\/?$/

/**
 * Actor contract set by `AuthGuard` (`req.auth = { userId }`) and read by
 * every controller and guard in the API. The interceptor must read this
 * shape — reading `req.user.id` previously wrote NULL user ids because
 * `AuthGuard` exposes `req.user.sub`, never `req.user.id`.
 */
interface AuthenticatedRequest extends Request {
  auth?: { userId: number }
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const key = `${req.method} ${req.path}`
    const action =
      SENSITIVE_ACTIONS[key] ??
      (STREAM_DELETE_PATTERN.test(key) ? AuditAction.STREAM_DELETE : undefined)

    if (!action) return next.handle()

    const ip = (req.headers["x-forwarded-for"] as string) ?? req.ip ?? ""
    const userId = req.auth?.userId ?? null

    return next.handle().pipe(
      // metadata is empty here because the interceptor doesn't have access to
      // the request body post-processing. Callers that need richer metadata
      // (e.g. AuthService) call auditService.logSafely() directly.
      // Fail-open policy (issue #530): logSafely never throws, so a failed
      // audit INSERT cannot surface as a post-response error either.
      tap(() => this.auditService.logSafely(userId, action, {}, ip)),
    )
  }
}
