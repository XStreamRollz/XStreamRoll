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

export type ShutdownReason =
  "SIGINT" | "SIGTERM" | "uncaughtException" | "unhandledRejection" | "manual"

export interface ShutdownHook {
  /** Human-readable name for logging. */
  name: string
  /** Cleanup routine. Throw to abort the shutdown with a non-zero exit. */
  run: (reason: ShutdownReason) => Promise<void> | void
  /**
   * Per-step timeout in milliseconds (issue #342).
   * When set, the hook is raced against this timeout and a
   * warning is logged if it is exceeded — shutdown continues
   * with the next step. Falls back to the global timeout when
   * omitted.
   */
  timeoutMs?: number
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
 * Run `promise` with a timeout. If the timeout fires first, log
 * a warning and return — the underlying promise is intentionally
 * allowed to continue (it will be abandoned when the process
 * exits). If the promise rejects, the rejection is propagated
 * so the caller can log the actual error.
 */
async function raceTimeout(
  promise: Promise<void>,
  timeoutMs: number,
  stepName: string,
  logger: Pick<Console, "log" | "warn" | "error">,
): Promise<boolean> {
  // Returns true if the promise resolved before the timeout,
  // false if the timeout fired.

  if (timeoutMs <= 0) {
    // No timeout; just await normally.
    await promise
    return true
  }

  // eslint-disable-next-line prefer-const
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true
      resolve()
    }, timeoutMs)
    if (typeof timer?.unref === "function") timer.unref()
  })

  await Promise.race([promise, timeout])

  if (timer !== undefined) clearTimeout(timer)

  if (timedOut) {
    logger.warn(
      `[shutdown] ${stepName} timed out after ${timeoutMs}ms — continuing`,
    )
    return false
  }
  return true
}

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
    this.logger.log(
      `[shutdown] starting (reason=${reason}, hooks=${this.hooks.length})`,
    )

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
      const stepTimeout = hook.timeoutMs ?? this.timeoutMs

      try {
        const runPromise = (async (): Promise<void> => {
          await hook.run(reason)
        })()

        const ok = await raceTimeout(
          runPromise,
          stepTimeout,
          hook.name,
          this.logger,
        )

        if (ok) {
          this.logger.log(`[shutdown] ${hook.name} ✓`)
        } else {
          hadError = true
        }
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
