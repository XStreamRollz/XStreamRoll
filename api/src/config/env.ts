import { z } from "zod"

const envSchema = z.object({
  PORT: z.string().default("3001"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // JWT_SECRET is required in production and test, but optional in development
  JWT_SECRET: z.string().optional(),
  STREAM_API_KEY: z.string().min(1, "STREAM_API_KEY is required"),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
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
  // Enforce JWT secret presence for non-development environments
  if (result.data.NODE_ENV !== "development" && !result.data.JWT_SECRET) {
    console.error(
      "Environment validation failed:\n  - JWT_SECRET: JWT_SECRET is required in non-development environments",
    )
    process.exit(1)
  }

  return result.data
}

export const env = validateEnv()
