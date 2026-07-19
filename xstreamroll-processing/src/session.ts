import { EventEmitter } from "events"

export type SessionState =
  | "idle"
  | "running"
  | "draining"
  | "stopped"
  | "errored"

export interface StreamEvent {
  streamId: string
  data: Record<string, unknown>
  timestamp: string
}

export interface ProcessedStreamEvent extends StreamEvent {
  processedAt: string
  processingLatencyMs: number | null
  workerId: string
  sessionId: string
}

export interface SessionHandlers {
  /**
   * Persists a processed event upstream. Returning a promise lets the
   * caller back-pressure the queue when the API is slow.
   */
  publish(event: ProcessedStreamEvent): Promise<void>
  /** Optional structured logger; defaults to console. */
  logger?: Pick<Console, "log" | "warn" | "error">
}

/**
 * Per-stream state machine.
 *
 * Each `StreamSession` owns its own queue, its own state, and an
 * isolated processing loop. The class is intentionally
 * dependency-free so it stays trivially unit-testable; all I/O is
 * delegated through {@link SessionHandlers.publish}.
 *
 * State graph:
 *
 *     idle ──start()──▶ running ──stop()──▶ draining ──▶ stopped
 *                 │                              │
 *                 ▼                              ▼
 *               errored ◀──────── (publish throws repeatedly) ────
 *
 * The session emits the following events for observability:
 *   - `state` (next, prev)
 *   - `processed` (ProcessedStreamEvent)
 *   - `error` (Error)
 */
export class StreamSession extends EventEmitter {
  public readonly id: string
  public readonly streamId: string
  public readonly createdAt: Date = new Date()

  private state: SessionState = "idle"
  private readonly queue: StreamEvent[] = []
  private processing = false
  private readonly handlers: SessionHandlers
  private readonly workerId: string
  private readonly logger: NonNullable<SessionHandlers["logger"]>

  constructor(streamId: string, workerId: string, handlers: SessionHandlers) {
    super()
    this.id = `${streamId}:${createSessionSuffix()}`
    this.streamId = streamId
    this.workerId = workerId
    this.handlers = handlers
    this.logger = handlers.logger ?? console
  }

  getState(): SessionState {
    return this.state
  }

  pendingCount(): number {
    return this.queue.length
  }

  start(): void {
    if (this.state !== "idle") return
    this.transition("running")
    void this.pump()
  }

  /**
   * Enqueue an event for this stream. Returns `false` when the session
   * is already past the running state so callers can route the event
   * elsewhere or surface back-pressure.
   */
  enqueue(event: StreamEvent): boolean {
    if (this.state !== "running") return false
    this.queue.push(event)
    if (!this.processing) void this.pump()
    return true
  }

  /**
   * Cooperative shutdown. Stops accepting new work, drains the queue,
   * then transitions to `stopped`. Resolves once the session is fully
   * stopped.
   */
  async stop(): Promise<void> {
    if (this.state === "stopped" || this.state === "errored") return
    if (this.state === "running") this.transition("draining")
    // wait for the pump to settle
    while (this.processing) {
      await sleep(10)
    }
    this.transition("stopped")
  }

  /**
   * Hard failure path used when the session cannot recover (e.g.
   * repeated publish errors). Drops queued work and marks the session
   * errored so the registry can evict it.
   */
  fail(err: Error): void {
    this.queue.length = 0
    this.emit("error", err)
    this.transition("errored")
  }

  /* -------------------------------------------------------------- */

  private async pump(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (
        this.queue.length > 0 &&
        (this.state === "running" || this.state === "draining")
      ) {
        const next = this.queue.shift()
        if (!next) break
        try {
          const processedAt = new Date()
          const processed: ProcessedStreamEvent = {
            ...next,
            processedAt: processedAt.toISOString(),
            processingLatencyMs: calculateProcessingLatencyMs(
              next.timestamp,
              processedAt,
            ),
            workerId: this.workerId,
            sessionId: this.id,
          }
          await this.handlers.publish(processed)
          this.emit("processed", processed)
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          this.logger.error(
            `[${this.workerId}] session ${this.id} publish failed: ${error.message}`,
          )
          // Re-queue the event at the head so order is preserved; the
          // outer registry decides whether to keep retrying.
          this.queue.unshift(next)
          this.fail(error)
          return
        }
      }
    } finally {
      this.processing = false
    }
  }

  private transition(next: SessionState): void {
    if (this.state === next) return
    const prev = this.state
    this.state = next
    this.emit("state", next, prev)
  }
}

function createSessionSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function calculateProcessingLatencyMs(
  eventTimestamp: string,
  processedAt: Date,
): number | null {
  const startedAt = Date.parse(eventTimestamp)
  if (Number.isNaN(startedAt)) return null
  return Math.max(0, processedAt.getTime() - startedAt)
}
