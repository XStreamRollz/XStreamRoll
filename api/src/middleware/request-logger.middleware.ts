import { Injectable, NestMiddleware, Optional } from "@nestjs/common"
import { Request, Response, NextFunction } from "express"
import { AsyncLocalStorage } from "async_hooks"
import { randomUUID } from "crypto"
import { MetricsService } from "../metrics/metrics.service"

export interface RequestStore {
  requestId: string
}

export const requestContextStorage = new AsyncLocalStorage<RequestStore>()

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId
}

const SENSITIVE_PATH_PATTERNS: RegExp[] = [/^\/auth\b/]

export type AuthedRequest = Request & { user?: { id: number | string } }

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(@Optional() private readonly metricsService?: MetricsService) {}

  use(req: AuthedRequest, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint()
    const isSensitive = SENSITIVE_PATH_PATTERNS.some((re) => re.test(req.path))
    const userId = req.user?.id ?? null
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.ip ??
      null

    const incomingRequestId = (req.headers["x-request-id"] as string | undefined)?.trim()
    const requestId =
      incomingRequestId && incomingRequestId.length > 0
        ? incomingRequestId
        : randomUUID()

    res.setHeader("X-Request-Id", requestId)

    requestContextStorage.run({ requestId }, () => {
      res.on("finish", () => {
        const durationMs =
          Number(process.hrtime.bigint() - start) / 1_000_000
        const log: Record<string, unknown> = {
          type: "http_request",
          timestamp: new Date().toISOString(),
          requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          userId,
          ip,
          userAgent: req.headers["user-agent"] ?? null,
          contentLength: res.getHeader("content-length") ?? null,
          // Honest flag: this middleware never reads req.body, but on
          // sensitive paths (e.g. /auth) we record that intent explicitly so
          // log readers and downstream redaction tools can rely on it.
          bodyRedacted: isSensitive,
        }

        const line = JSON.stringify(log)
        if (res.statusCode >= 500) {
          console.error(line)
        } else {
          console.log(line)
        }

        // Skip /metrics path to avoid self-instrumentation noise
        if (this.metricsService && req.path !== "/metrics") {
          const labels = {
            method: req.method,
            path: req.route?.path ?? req.path,
            status_code: String(res.statusCode),
          }
          this.metricsService.httpRequestsTotal.inc(labels)
          this.metricsService.httpRequestDurationSeconds.observe(
            labels,
            durationMs / 1000,
          )
        }
      })

      next()
    })
  }
}
