import { z } from "zod"

const envSchema = z.object({
  API_URL: z.string().url().default("http://localhost:3001"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  POLL_INTERVAL_MS: z.string().default("5000"),
  /**
   * Backend for the distributed stream-lock manager (issue #216).
   * `memory` keeps everything in-process and is appropriate for
   * the test suite plus single-worker deployments. `postgres`
   * fronts a small `stream_locks` table and is the right pick for
   * horizontally-scaled worker pods.
   */
  LOCK_BACKEND: z.enum(["memory", "postgres"]).default("memory"),
  /**
   * Postgres connection string used when LOCK_BACKEND=postgres.
   * Optional in development — failures are surfaced through
   * `createLockManager` rather than silently falling back to
   * in-process locking.
   */
  DATABASE_URL: z.string().url().optional(),
  /** TTL for acquired locks, in milliseconds. Defaults to 30s. */
  LOCK_TTL_MS: z
    .string()
    .default("30000")
    .transform((s) => Number(s))
    .pipe(z.number().int().positive()),
  MAX_QUEUE_DEPTH: z
    .string()
    .default("1000")
    .transform((s) => Number(s))
    .pipe(z.number().int().positive()),
  POLL_BATCH_SIZE: z
    .string()
    .default("100")
    .transform((s) => Number(s))
    .pipe(z.number().int().positive()),
  PROCESSING_PUBLISH_MAX_RETRIES: z
    .string()
    .default("3")
    .transform((s) => Number(s))
    .pipe(z.number().int().min(0)),
  /**
   * Backend for the per-stream {@link EventFilter} config store
   * (issue #351). `memory` keeps every config in-process and matches
   * the pre-#351 behaviour — appropriate for the test suite and
   * for single-worker deployments. `redis` fronts a small hash +
   * pub/sub channel so every worker in a horizontally-scaled fleet
   * agrees on which events to drop.
   */
  EVENT_FILTER_BACKEND: z.enum(["memory", "redis"]).default("memory"),
  /**
   * Redis URL used when `EVENT_FILTER_BACKEND=redis`. Optional —
   * falls back to `REDIS_URL` so workers running in the same
   * cluster as the API can reuse the existing connection. Ignored
   * when `EVENT_FILTER_BACKEND=memory`.
   */
  EVENT_FILTER_REDIS_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /**
   * Global hard deadline (ms) for the entire shutdown sequence (issue #342).
   * When a registered hook exceeds its per-step timeout a warning is logged
   * and shutdown continues to the next step. Defaults to 15000 (15s).
   */
  SHUTDOWN_TIMEOUT_MS: z
    .string()
    .default("15000")
    .transform((s) => Number(s))
    .pipe(z.number().int().positive()),
  /**
   * Per-session drain deadline (ms) enforced by SessionRegistry.drainAll()
   * (issue #342). When a session's stop() hangs, the timeout fires a warning
   * and the next session is drained. Defaults to 5000 (5s).
   */
  SESSION_DRAIN_TIMEOUT_MS: z
    .string()
    .default("5000")
    .transform((s) => Number(s))
    .pipe(z.number().int().positive()),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n")
    console.error(`Environment validation failed:\n${errors}`)
    process.exit(1)
  }
  return result.data
}

export const env = validateEnv()
