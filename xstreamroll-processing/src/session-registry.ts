import { SessionHandlers, StreamEvent, StreamSession } from "./session"

export interface SessionRegistryOptions {
  /** Hard cap on simultaneously-active sessions. */
  maxConcurrentSessions: number
  /** Logger used by spawned sessions; defaults to console. */
  logger?: Pick<Console, "log" | "warn" | "error">
}

/**
 * Owns the lifetime of every {@link StreamSession} the worker is
 * processing. Sessions are keyed by `streamId` so re-routing an event
 * for an existing stream is O(1) and a fresh stream lazily allocates
 * its own state machine.
 *
 * The registry enforces the `MAX_CONCURRENT_SESSIONS` envelope: routing
 * an event for a stream that does not yet have a session returns
 * `"capacity"` when the worker is full, which lets the caller emit a
 * back-pressure signal or shed the event.
 */
export class SessionRegistry {
  private readonly sessions = new Map<string, StreamSession>()
  private readonly handlers: SessionHandlers
  private readonly workerId: string
  private readonly options: SessionRegistryOptions

  constructor(workerId: string, handlers: SessionHandlers, options: SessionRegistryOptions) {
    this.workerId = workerId
    this.handlers = handlers
    this.options = options
  }

  /**
   * Route an event to the matching session, lazily creating one when
   * capacity allows.
   *
   * Possible outcomes:
   *   - "enqueued" — event accepted by an existing or freshly-created session
   *   - "capacity" — no existing session and the worker is at capacity
   *   - "rejected" — the matching session is past the running state
   *                  (e.g. draining/stopped/errored)
   */
  route(event: StreamEvent): "enqueued" | "capacity" | "rejected" {
    const existing = this.sessions.get(event.streamId)
    if (existing) {
      return existing.enqueue(event) ? "enqueued" : "rejected"
    }

    if (this.sessions.size >= this.options.maxConcurrentSessions) {
      return "capacity"
    }

    const session = this.spawn(event.streamId)
    session.start()
    const ok = session.enqueue(event)
    return ok ? "enqueued" : "rejected"
  }

  get(streamId: string): StreamSession | undefined {
    return this.sessions.get(streamId)
  }

  size(): number {
    return this.sessions.size
  }

  capacity(): { used: number; max: number } {
    return { used: this.sessions.size, max: this.options.maxConcurrentSessions }
  }

  /** Iterator over live (non-stopped, non-errored) sessions. */
  liveSessions(): StreamSession[] {
    return Array.from(this.sessions.values()).filter((s) => {
      const st = s.getState()
      return st === "running" || st === "draining"
    })
  }

  /**
   * Gracefully stop every session and wait for all queues to drain.
   * Used during worker shutdown.
   */
  async drainAll(): Promise<void> {
    const all = Array.from(this.sessions.values())
    await Promise.all(all.map((s) => s.stop()))
    this.sessions.clear()
  }

  /* -------------------------------------------------------------- */

  private spawn(streamId: string): StreamSession {
    const session = new StreamSession(streamId, this.workerId, this.handlers)
    this.sessions.set(streamId, session)
    session.on("state", (next) => {
      if (next === "stopped" || next === "errored") {
        // self-evict so capacity is reclaimed
        const current = this.sessions.get(streamId)
        if (current === session) this.sessions.delete(streamId)
      }
    })
    return session
  }
}
