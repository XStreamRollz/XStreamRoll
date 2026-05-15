import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common"
import { Observable, tap } from "rxjs"
import { Request } from "express"
import { AuditService } from "./audit.service"

const SENSITIVE_ACTIONS: Record<string, string> = {
  "POST /auth/login": "login",
  "POST /auth/password": "password_change",
  "DELETE /streams": "stream_delete",
  "PATCH /users/role": "role_change",
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
      tap(() => this.auditService.log(userId, action, ip)),
    )
  }
}
