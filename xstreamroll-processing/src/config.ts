import { z } from "zod"

const envSchema = z.object({
  API_URL: z.string().url().default("http://localhost:3001"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  POLL_INTERVAL_MS: z.string().default("5000"),
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
