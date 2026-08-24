import { createHash, timingSafeEqual } from "crypto"

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"

import type { Request } from "express"

/**
 * Authenticates event-ingestion requests (`POST /streams/events`) via
 * the `X-Stream-Api-Key` header (issue #514).
 *
 * The expected key is read from the same `STREAM_API_KEY` env var that
 * `config/env.ts` validates. Comparison is constant-time (SHA-256 both
 * sides first so `timingSafeEqual` gets equal-length buffers). When the
 * env var is unset — which `validateEnv()` prevents in practice — every
 * request is rejected, which is the safe default for a public endpoint.
 */
@Injectable()
export class StreamApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const provided = request.headers["x-stream-api-key"]
    if (typeof provided !== "string" || provided.length === 0) {
      throw new UnauthorizedException("missing stream API key")
    }

    const expected = process.env.STREAM_API_KEY ?? ""
    if (expected.length === 0) {
      throw new UnauthorizedException("stream API key is not configured")
    }

    const providedHash = createHash("sha256").update(provided).digest()
    const expectedHash = createHash("sha256").update(expected).digest()
    if (
      providedHash.length !== expectedHash.length ||
      !timingSafeEqual(providedHash, expectedHash)
    ) {
      throw new UnauthorizedException("invalid stream API key")
    }
    return true
  }
}
