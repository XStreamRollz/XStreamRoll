import { SessionHandlers, StreamEvent, StreamSession } from "./session"
import { LockManager, LockToken } from "./leader-election"
import { Logger } from "./logger"
import * as metrics from "./metrics"

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
  /** Structured logger for detailed observability (issue #338). */
  structuredLogger?: Logger
  /**
   * Maximum pending events per session queue. When exceeded,
   * `StreamSession.enqueue()` returns false so the caller can apply
   * backpressure (issue #339).
   */
  maxQueueDepth?: number
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
 * The lock is acquired *before* the session is created and started
 * (issue #338) so an unowned session can never process events. If
 * another live worker already owns the stream the registry returns
 * `"locked"` so the caller can drop the event without producing
 * duplicate publish traffic. Each acquired lock is heart-beated on a
 * recurring timer and released when the session stops or errors.
 */
export class SessionRegistry {
  private readonly sessions = new Map<string, StreamSession>()
  private readonly lockTokens = new Map<string, LockToken>()
  private readonly heartbeats = new Map<string, NodeJS.Timeout>()
  /**
   * In-flight lock acquisitions keyed by `streamId` (issue #338).
   * Two concurrent `route()` calls for the same not-yet-owned stream
   * share a single `lockManager.acquire()` round trip instead of each
   * issuing their own — the second caller awaits the promise the first
   * one registered here. Entries are removed as soon as the acquire
   * settles.
   */
  private readonly inflightAcquires = new Map<string, Promise<LockToken | null>>()
  private readonly handlers: SessionHandlers
  private readonly workerId: string
  private readonly options: SessionRegistryOptions
  private readonly heartbeatMs: number
  private readonly logger: Logger

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
    // Initialize structured logger (issue #338)
    this.logger = options.structuredLogger ?? new Logger({ workerId })
    this.logger.info("SessionRegistry initialized", {
      maxConcurrentSessions: options.maxConcurrentSessions,
      heartbeatMs: this.heartbeatMs,
      lockTtlMs: options.lockManager.ttlMs,
    })
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
      this.logger.debug("Routing to existing session", { streamId: event.streamId })
      return existing.enqueue(event) ? "enqueued" : "rejected"
    }

    if (this.sessions.size >= this.options.maxConcurrentSessions) {
      this.logger.warn("Capacity reached, rejecting new stream", {
        streamId: event.streamId,
        currentSessions: this.sessions.size,
        maxSessions: this.options.maxConcurrentSessions,
      })
      return "capacity"
    }

    // Acquire the lock BEFORE spawning the session (issue #338). A
    // session that starts before ownership is confirmed would process
    // and publish events even when the lock ultimately belongs to
    // another worker, producing the duplicate publish traffic issue
    // #216 set out to eliminate.
    //
    // Concurrent `route()` calls for the same not-yet-owned stream are
    // deduplicated through `inflightAcquires`: the first caller records
    // its acquire promise and every other caller awaits that same
    // promise instead of firing a redundant round trip at the lock
    // backend.
    let token: LockToken | null
    try {
      this.logger.debug("Attempting lock acquisition", { streamId: event.streamId })
      token = await this.acquireDeduplicated(event.streamId)
    } catch (err) {
      // Lock backend blew up. Re-throw so the worker can decide
      // whether to retry or crash — silently downgrading a
      // coordinator failure to `"rejected"` would lose the
      // signal that something infrastructure-level is wrong.
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error("Lock acquisition failed", {
        streamId: event.streamId,
        error: message,
      })
      this.options.logger?.error?.(
        `[${this.workerId}] lock acquire for ${event.streamId} threw: ${message}`,
      )
      throw err
    }

    if (!token) {
      this.logger.warn("Lock denied - stream owned by another worker", {
        streamId: event.streamId,
      })
      this.options.logger?.warn?.(
        `[${this.workerId}] stream ${event.streamId} is owned by another worker; skipping`,
      )
      metrics.incrementLockAcquisitionsDenied()
      return "locked"
    }

    // A concurrent `route()` may have won the dedupe race, spawned the
    // session, and stored its token while we were awaiting. If a
    // session now exists for this stream, route into it and drop the
    // duplicate token so we don't leak a second claim.
    const raced = this.sessions.get(event.streamId)
    if (raced) {
      this.logger.debug("Concurrent route race detected, reusing existing session", {
        streamId: event.streamId,
      })
      metrics.incrementConcurrentRouteDedupes()
      if (this.lockTokens.get(event.streamId)?.token !== token.token) {
        void this.options.lockManager.release(event.streamId, token).catch((err) => {
          const message = err instanceof Error ? err.message : String(err)
          this.logger.warn("Failed to release duplicate lock", {
            streamId: event.streamId,
            error: message,
          })
          this.options.logger?.warn?.(
            `[${this.workerId}] failed to release duplicate lock for ${event.streamId}: ${message}`,
          )
        })
      }
      return raced.enqueue(event) ? "enqueued" : "rejected"
    }

    // Lock confirmed and we are the sole owner — now it is safe to
    // spawn and start the session.
    this.logger.info("Lock acquired, spawning session", {
      streamId: event.streamId,
      token: token.token,
      expiresAt: new Date(token.expiresAt).toISOString(),
    })
    metrics.incrementLockAcquisitions()
    this.lockTokens.set(event.streamId, token)
    this.startHeartbeat(event.streamId, token)
    const session = this.spawn(event.streamId)
    session.start()

    const ok = session.enqueue(event)
    return ok ? "enqueued" : "rejected"
  }

  /**
   * Acquire the lock for `streamId`, collapsing concurrent callers onto
   * a single in-flight `lockManager.acquire()` promise (issue #338).
   * The map entry is cleared as soon as the acquire settles so a later
   * `route()` (e.g. after the session stops) starts a fresh claim.
   */
  private acquireDeduplicated(streamId: string): Promise<LockToken | null> {
    const pending = this.inflightAcquires.get(streamId)
    if (pending) {
      this.logger.debug("Deduplicating concurrent lock acquisition", {
        streamId,
      })
      return pending
    }

    const promise = this.options.lockManager
      .acquire(streamId)
      .finally(() => {
        this.inflightAcquires.delete(streamId)
      })
    this.inflightAcquires.set(streamId, promise)
    return promise
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

  totalQueueDepth(): number {
    let total = 0
    for (const session of this.sessions.values()) {
      total += session.pendingCount()
    }
    return total
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
    this.logger.info("Draining all sessions", {
      sessionCount: this.sessions.size,
      lockCount: this.lockTokens.size,
    })
    const all = Array.from(this.sessions.values())
    await Promise.all(all.map((s) => s.stop()))
    this.sessions.clear()
    this.lockTokens.clear()
    this.inflightAcquires.clear()
    for (const t of this.heartbeats.values()) {
      clearTimeout(t)
    }
    this.heartbeats.clear()
    try {
      await this.options.lockManager.releaseAll()
      this.logger.info("All locks released successfully")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error("Failed to release all locks", { error: message })
      this.options.logger?.warn?.(
        `[${this.workerId}] lockManager.releaseAll failed: ${message}`,
      )
    }
  }

  /* -------------------------------------------------------------- */

  private spawn(streamId: string): StreamSession {
    this.logger.debug("Spawning new session", { streamId })
    const session = new StreamSession(streamId, this.workerId, this.handlers, this.options.maxQueueDepth)
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
      this.logger.info("Session stopped, releasing lock", {
        streamId,
        state: next,
      })
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
        void this.options.lockManager.release(streamId, token).then(
          () => {
            metrics.incrementLockReleases()
            this.logger.debug("Lock released successfully", { streamId })
          },
          (err) => {
            const message = err instanceof Error ? err.message : String(err)
            metrics.incrementLockReleasesFailed()
            this.logger.warn("Failed to release lock", {
              streamId,
              error: message,
            })
            this.options.logger?.warn?.(
              `[${this.workerId}] failed to release lock for ${streamId}: ${message}`,
            )
          },
        )
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
          this.logger.warn("Lock lost during heartbeat renewal", {
            streamId,
          })
          metrics.incrementLockRenewalsFailed()
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
        metrics.incrementLockRenewals()
        current.expiresAt = Date.now() + this.options.lockManager.ttlMs
        scheduleNext()
      } catch (err) {
        // Transient backend blip — keep trying on the next tick.
        const message = err instanceof Error ? err.message : String(err)
        this.logger.warn("Heartbeat renewal failed transiently", {
          streamId,
          error: message,
        })
        this.options.logger?.warn?.(
          `[${this.workerId}] heartbeat renew for ${streamId} failed: ${message}`,
        )
        scheduleNext()
      }
    }

    scheduleNext()
  }
}
