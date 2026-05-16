import { Injectable } from "@nestjs/common"

/**
 * Ownership lookup boundary. The real implementation will query the
 * `streams` table (`SELECT user_id FROM streams WHERE id = $1`); this
 * placeholder lets the rest of the pipeline ship and be tested without
 * blocking on the DB layer.
 *
 * Configure deterministic ownership for tests / local dev via the
 * STREAM_OWNERSHIP_DEMO env var. Format:
 *
 *     STREAM_OWNERSHIP_DEMO="1:1,1:2,2:7"
 *
 * means user 1 owns streams 1 and 2; user 2 owns stream 7. When the env
 * var is empty (production-by-default) the service falls back to a
 * deny-all policy, so the real DB-backed implementation MUST replace
 * this before the endpoints are made public.
 */
@Injectable()
export class StreamOwnershipService {
  private readonly demoAllow: ReadonlySet<string>

  constructor() {
    const raw = process.env.STREAM_OWNERSHIP_DEMO ?? ""
    this.demoAllow = new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
  }

  async ownsStream(userId: number, streamId: number): Promise<boolean> {
    return this.demoAllow.has(`${userId}:${streamId}`)
  }
}
