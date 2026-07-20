/**
 * Structured logger with correlation IDs.
 *
 * Every log line is emitted as a single JSON object so the output
 * slots cleanly into a log shipper (Loki, Datadog, ELK, …) without
 * a fragile regex parser. Each line carries:
 *
 *   - ts       — ISO-8601 timestamp
 *   - level    — "debug" | "info" | "warn" | "error"
 *   - msg      — the human message
 *   - workerId — every worker is tagged with a stable id
 *   - corrId   — per-request correlation id, threaded through polls
 *                and session lifecycle calls
 *   - …        — any extra fields passed via the `fields` arg
 *
 * The active correlation id is kept on an `AsyncLocalStorage` so
 * callers don't have to thread it through every function signature;
 * the `withCorrelation` helper scopes an id to a callback tree.
 */
import { AsyncLocalStorage } from "async_hooks"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogFields {
  [key: string]: unknown
}

export interface LogEntry extends LogFields {
  ts: string
  level: LogLevel
  msg: string
  workerId?: string
  corrId?: string
}

export interface LoggerSink {
  (entry: LogEntry): void
}

export interface LoggerOptions {
  workerId: string
  /** Minimum level emitted. Defaults to "info". */
  level?: LogLevel
  /** Sink — defaults to stdout JSON. Override in tests. */
  sink?: LoggerSink
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const storage = new AsyncLocalStorage<{ corrId?: string }>()

/**
 * Generate a short, URL-safe correlation id. Uses crypto.randomUUID
 * when available, falling back to a Math.random() hex string.
 */
export function newCorrelationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Run `fn` with `corrId` set as the active correlation id. Nested
 * calls inherit the id unless they install their own.
 */
export function withCorrelation<T>(corrId: string, fn: () => T): T {
  return storage.run({ corrId }, fn)
}

/** Get the current correlation id (or undefined if none is set). */
export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.corrId
}

export class Logger {
  private readonly workerId: string
  private readonly minLevel: number
  private readonly sink: LoggerSink

  constructor(options: LoggerOptions) {
    this.workerId = options.workerId
    this.minLevel = LEVEL_ORDER[options.level ?? "info"]
    this.sink =
      options.sink ??
      ((entry) => {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(entry))
      })
  }

  private emit(level: LogLevel, msg: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < this.minLevel) return
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      workerId: this.workerId,
      ...(currentCorrelationId() ? { corrId: currentCorrelationId() } : {}),
      ...(fields ?? {}),
    }
    try {
      this.sink(entry)
    } catch {
      // Never let a logging failure crash the worker.
    }
  }

  debug(msg: string, fields?: LogFields): void {
    this.emit("debug", msg, fields)
  }
  info(msg: string, fields?: LogFields): void {
    this.emit("info", msg, fields)
  }
  warn(msg: string, fields?: LogFields): void {
    this.emit("warn", msg, fields)
  }
  error(msg: string, fields?: LogFields): void {
    this.emit("error", msg, fields)
  }

  /** Create a child logger with extra default fields merged in. */
  child(defaults: LogFields): Logger {
    return {
      debug: (m: string, f?: LogFields) =>
        this.debug(m, { ...defaults, ...(f ?? {}) }),
      info: (m: string, f?: LogFields) =>
        this.info(m, { ...defaults, ...(f ?? {}) }),
      warn: (m: string, f?: LogFields) =>
        this.warn(m, { ...defaults, ...(f ?? {}) }),
      error: (m: string, f?: LogFields) =>
        this.error(m, { ...defaults, ...(f ?? {}) }),
    } as unknown as Logger
  }
}
