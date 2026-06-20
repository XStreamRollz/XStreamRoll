import { SessionHandlers, StreamEvent, StreamSession } from "./session"
import { LockManager, LockToken } from "./leader-election"

export type RouteResult = "enqueued" | "capacity" | "rejected" | "locked"

export interface SessionRegistryOptions {
  /** Hard cap on simultaneously-active sessions. */
  maxConcurrentSessions: number
  /**
   * Distributed lock manager used to claim stream ownership before
   * spawning a session. Required — the worker passes the value from
   * `createLockManager(...)`.
   */
  lockManager: LockManager
  /**
   * Heartbeat cadence in milliseconds. If omitted the registry
   * schedules renewals at `lockManager.ttlMs / 3`. The chosen value
   * MUST be strictly less than `lockManager.ttlMs` to keep the lock
   * alive across at least one missed renewal.
   */
  heartbeatMs?: number
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
 *
 * When a lock manager is supplied, the registry atomically claims
 * ownership of `streamId` (issue #216) before spawning a session.
 * If another live worker already owns the stream the registry
 * returns `"locked"` so the caller can drop the event without
 * producing duplicate publish traffic. Each acquired lock is
 * heart-beated on a recurring timer and released when the session
 * stops or errors.
 */
export class SessionRegistry {
  private readonly sessions = new Map<string, StreamSession>()
  private readonly lockTokens = new Map<string, LockToken>()
  private readonly heartbeats = new Map<string, NodeJS.Timeout>()
  private readonly handlers: SessionHandlers
  private readonly workerId: string
  private readonly options: SessionRegistryOptions
  private readonly heartbeatMs: number

  constructor(workerId: string, handlers: SessionHandlers, options: SessionRegistryOptions) {
    if (!options.lockManager) {
      throw new Error("SessionRegistry requires a LockManager (issue #216)")
    }
    this.workerId = workerId
    this.handlers = handlers
    this.options = options
    const fallback = Math.max(1_000, Math.floor(options.lockManager.ttlMs / 3))
    this.heartbeatMs = options.heartbeatMs ?? fallback
    if (this.heartbeatMs >= options.lockManager.ttlMs) {
      throw new Error(
        `heartbeatMs (${this.heartbeatMs}) must be strictly less than lockManager.ttlMs (${options.lockManager.ttlMs})`,
      )
    }
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
   *   - "locked"   — the lock manager reports another live worker
   *                  already owns this streamId; caller should drop
   *                  the event (issue #216)
   *
   * The method is `async` since lock acquisition can be a network
   * round trip. Existing sessions are still routed synchronously to
   * keep the hot path fast.
   */
  async route(event: StreamEvent): Promise<RouteResult> {
    const existing = this.sessions.get(event.streamId)
    if (existing) {
      return existing.enqueue(event) ? "enqueued" : "rejected"
    }

    if (this.sessions.size >= this.options.maxConcurrentSessions) {
      return "capacity"
    }

    // Optimistically claim a slot in the local map BEFORE awaiting
    // the lock. That way two concurrent `route()` calls for the same
    // streamId dedupe to a single placeholder session — the second
    // caller sees `existing` and skips the lock round trip
    // altogether.
    const session = this.spawn(event.streamId)
    session.start()

    let token: LockToken | null
    try {
      token = await this.options.lockManager.acquire(event.streamId)
    } catch (err) {
      // Lock backend blew up. Re-throw so the worker can decide
      // whether to retry or crash — silently downgrading a
      // coordinator failure to `"rejected"` would lose the
      // signal that something infrastructure-level is wrong.
      const message = err instanceof Error ? err.message : String(err)
      this.options.logger?.error?.(
        `[${this.workerId}] lock acquire for ${event.streamId} threw: ${message}`,
      )
      session.fail(new Error(`lock acquire failed: ${message}`))
      throw err
    }
    if (!token) {
      this.options.logger?.warn?.(
        `[${this.workerId}] stream ${event.streamId} is owned by another worker; skipping`,
      )
      session.fail(new Error(`stream ${event.streamId} locked by another worker`))
      return "locked"
    }

    this.lockTokens.set(event.streamId, token)
    this.startHeartbeat(event.streamId, token)

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

  /** Number of locks currently held by this worker (test helper). */
  lockCount(): number {
    return this.lockTokens.size
  }

  /**
   * Gracefully stop every session and wait for all queues to drain.
   * Used during worker shutdown. Each session's state listener will
   * release its distributed lock synchronously when the session
   * transitions to `stopped`/`errored`; this method also issues a
   * final `releaseAll()` on the lock manager so stragglers (e.g.
   * sessions that errored before publishing) cannot survive a
   * restart.
   */
  async drainAll(): Promise<void> {
    const all = Array.from(this.sessions.values())
    await Promise.all(all.map((s) => s.stop()))
    this.sessions.clear()
    this.lockTokens.clear()
    for (const t of this.heartbeats.values()) {
      clearTimeout(t)
    }
    this.heartbeats.clear()
    try {
      await this.options.lockManager.releaseAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.options.logger?.warn?.(
        `[${this.workerId}] lockManager.releaseAll failed: ${message}`,
      )
    }
  }

  /* -------------------------------------------------------------- */

  private spawn(streamId: string): StreamSession {
    const session = new StreamSession(streamId, this.workerId, this.handlers)
    this.sessions.set(streamId, session)
    // EventEmitter throws synchronously when an `"error"` event is
    // emitted without a listener. `StreamSession.fail()` always
    // emits one before transitioning to `"errored"` — register a
    // passive listener here so the state-driven cleanup path stays
    // authoritative (state listener below does the real work).
    session.on("error", () => {
      /* state listener handles lock release + eviction */
    })
    session.on("state", (next) => {
      if (next !== "stopped" && next !== "errored") return
      const current = this.sessions.get(streamId)
      // Only evict if THIS session instance is still the one in the
      // map — a later `spawn(streamId)` would have overwritten the
      // entry and the original session is now an orphan we must not
      // touch.
      if (current !== session) return
      this.sessions.delete(streamId)

      const token = this.lockTokens.get(streamId)
      if (token) {
        this.lockTokens.delete(streamId)
        const timer = this.heartbeats.get(streamId)
        if (timer) {
          clearTimeout(timer)
          this.heartbeats.delete(streamId)
        }
        void this.options.lockManager.release(streamId, token).catch((err) => {
          const message = err instanceof Error ? err.message : String(err)
          this.options.logger?.warn?.(
            `[${this.workerId}] failed to release lock for ${streamId}: ${message}`,
          )
        })
      }
    })
    return session
  }

  private startHeartbeat(streamId: string, token: LockToken): void {
    const scheduleNext = (): void => {
      // Don't re-arm if the lock has been released or replaced (e.g.
      // by a state listener clearing `lockTokens`).
      if (this.lockTokens.get(streamId)?.token !== token.token) return
      const timer = setTimeout(tick, this.heartbeatMs)
      if (typeof timer.unref === "function") timer.unref()
      this.heartbeats.set(streamId, timer)
    }

    const tick = async (): Promise<void> => {
      this.heartbeats.delete(streamId)
      const current = this.lockTokens.get(streamId)
      if (!current || current.token !== token.token) return
      try {
        const stillOurs = await this.options.lockManager.renew(streamId, current)
        if (!stillOurs) {
          // Lost the lock to another worker — drop our session so
          // they can pick up where we left off. We deliberately do
          // NOT release here: we no longer own the row, and
          // `release()` would no-op anyway.
          const session = this.sessions.get(streamId)
          if (session) {
            const st = session.getState()
            if (st === "running" || st === "draining") {
              this.options.logger?.warn?.(
                `[${this.workerId}] lost lock for ${streamId}; failing session`,
              )
              session.fail(new Error(`lost lock for stream ${streamId}`))
            }
          }
          return
        }
        current.expiresAt = Date.now() + this.options.lockManager.ttlMs
        scheduleNext()
      } catch (err) {
        // Transient backend blip — keep trying on the next tick.
        const message = err instanceof Error ? err.message : String(err)
        this.options.logger?.warn?.(
          `[${this.workerId}] heartbeat renew for ${streamId} failed: ${message}`,
        )
        scheduleNext()
      }
    }

    scheduleNext()
  }
}
