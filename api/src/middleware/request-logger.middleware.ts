import { Injectable, NestMiddleware } from "@nestjs/common"
import { Request, Response, NextFunction } from "express"
import { env } from "../config/env"
import { getRequestIp, maskRequestIp } from "../common/ip-mask"

const SENSITIVE_PATH_PATTERNS: RegExp[] = [/^\/auth\b/]

export type AuthedRequest = Request & { user?: { id: number | string } }

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: AuthedRequest, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint()
    const isSensitive = SENSITIVE_PATH_PATTERNS.some((re) => re.test(req.path))
    const userId = req.user?.id ?? null
    const ip = maskRequestIp(getRequestIp(req), env.LOG_IP_MASKING)

    res.on("finish", () => {
      const durationMs =
        Number(process.hrtime.bigint() - start) / 1_000_000
      const log: Record<string, unknown> = {
        type: "http_request",
        timestamp: new Date().toISOString(),
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
    })

    next()
  }
}
