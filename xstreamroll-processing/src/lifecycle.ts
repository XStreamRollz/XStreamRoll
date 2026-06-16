/**
 * Graceful shutdown coordinator for the stream-processing worker.
 *
 * The worker is a long-running Node process. When the orchestrator
 * (systemd, Docker, Kubernetes, `npm run start`) sends SIGTERM /
 * SIGINT, the worker should:
 *
 *   1. stop accepting new work from the API poll loop,
 *   2. stop the metrics HTTP server (release the port),
 *   3. drain every live session's queue,
 *   4. close the HTTP client keep-alive pool,
 *   5. exit with a status code that reflects whether drain succeeded.
 *
 * Coordinating this by hand in {@link ./worker.ts} is error-prone,
 * especially around double-signal handling. This module owns the
 * state machine and the cleanup sequence so the worker file stays
 * declarative.
 */

export type ShutdownReason = "SIGINT" | "SIGTERM" | "uncaughtException" | "unhandledRejection" | "manual"

export interface ShutdownHook {
  /** Human-readable name for logging. */
  name: string
  /** Cleanup routine. Throw to abort the shutdown with a non-zero exit. */
  run: (reason: ShutdownReason) => Promise<void> | void
}

export interface ShutdownOptions {
  /** Hard timeout in ms after which shutdown is forced. Defaults to 15s. */
  timeoutMs?: number
  /** Exit handler — defaults to process.exit. Override in tests. */
  exit?: (code: number) => void
  /** Logger — defaults to console. */
  logger?: Pick<Console, "log" | "warn" | "error">
}

const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Singleton-style coordinator. Register hooks during startup, call
 * {@link GracefulShutdown.install} once, then `await requestShutdown`
 * from any signal handler.
 */
export class GracefulShutdown {
  private hooks: ShutdownHook[] = []
  private state: "idle" | "shutting-down" | "done" = "idle"
  private readonly timeoutMs: number
  private readonly exit: (code: number) => void
  private readonly logger: Pick<Console, "log" | "warn" | "error">

  constructor(options: ShutdownOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.exit = options.exit ?? ((code) => process.exit(code))
    this.logger = options.logger ?? console
  }

  /** Register a cleanup hook. Hooks run in registration order. */
  register(hook: ShutdownHook): void {
    this.hooks.push(hook)
  }

  /**
   * Wire SIGINT / SIGTERM / uncaughtException / unhandledRejection to
   * trigger {@link requestShutdown}. Safe to call multiple times —
   * signal listeners are only added once.
   */
  install(): void {
    if (this.installed) return
    this.installed = true

    const handler = (signal: ShutdownReason) => {
      this.logger.log(`[shutdown] received ${signal}`)
      void this.requestShutdown(signal)
    }

    process.on("SIGINT", () => handler("SIGINT"))
    process.on("SIGTERM", () => handler("SIGTERM"))
    process.on("uncaughtException", (err) => {
      this.logger.error(`[shutdown] uncaughtException: ${err.message}`)
      void this.requestShutdown("uncaughtException")
    })
    process.on("unhandledRejection", (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      this.logger.error(`[shutdown] unhandledRejection: ${message}`)
      void this.requestShutdown("unhandledRejection")
    })
  }

  private installed = false

  /**
   * Trigger the shutdown sequence. Multiple callers are coalesced —
   * only the first one runs the hooks.
   */
  async requestShutdown(reason: ShutdownReason): Promise<void> {
    if (this.state !== "idle") return
    this.state = "shutting-down"
    this.logger.log(`[shutdown] starting (reason=${reason}, hooks=${this.hooks.length})`)

    // Hard deadline. If a hook hangs we still want to exit.
    const timer = setTimeout(() => {
      this.logger.error(
        `[shutdown] timed out after ${this.timeoutMs}ms — forcing exit(1)`,
      )
      this.state = "done"
      this.exit(1)
    }, this.timeoutMs)
    // unref() so the timer itself never keeps the loop alive.
    if (typeof timer.unref === "function") timer.unref()

    let hadError = false
    for (const hook of this.hooks) {
      try {
        await hook.run(reason)
        this.logger.log(`[shutdown] ${hook.name} ✓`)
      } catch (err) {
        hadError = true
        const message = err instanceof Error ? err.message : String(err)
        this.logger.error(`[shutdown] ${hook.name} failed: ${message}`)
      }
    }

    clearTimeout(timer)
    this.state = "done"
    this.logger.log(`[shutdown] complete (hadError=${hadError})`)
    this.exit(hadError ? 1 : 0)
  }

  /** Test-only inspection of the current state. */
  getState(): "idle" | "shutting-down" | "done" {
    return this.state
  }
}
