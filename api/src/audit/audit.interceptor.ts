import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common"
import { Observable, tap } from "rxjs"
import { Request } from "express"
import { AuditService } from "./audit.service"
import { AuditAction } from "./audit-action.enum"

const SENSITIVE_ACTIONS: Record<string, AuditAction> = {
  "POST /auth/login": AuditAction.LOGIN,
  "POST /auth/password": AuditAction.PASSWORD_CHANGE,
  "DELETE /streams": AuditAction.STREAM_DELETE,
  "PATCH /users/role": AuditAction.ROLE_CHANGE,
  "PATCH /users/me": AuditAction.PROFILE_UPDATE,
  "POST /users/me/change-password": AuditAction.PASSWORD_CHANGE,
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>()
    const key = `${req.method} ${req.path}`
    const action = Object.entries(SENSITIVE_ACTIONS).find(([pattern]) =>
      key.startsWith(pattern),
    )?.[1]

    if (!action) return next.handle()

    const ip = (req.headers["x-forwarded-for"] as string) ?? req.ip ?? ""
    const userId = (req as Request & { user?: { id: number } }).user?.id ?? null

    return next.handle().pipe(
      // metadata is empty here because the interceptor doesn't have access to
      // the request body post-processing. Callers that need richer metadata
      // (e.g. AuthService) call auditService.log() directly.
      tap(() => this.auditService.log(userId, action, {}, ip)),
    )
  }
}
