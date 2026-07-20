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
