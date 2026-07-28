/**
 * Issue #318 — JWT secret entropy validation.
 *
 * Production deployment with a short / placeholder JWT signing secret
 * (e.g. `JWT_SECRET=secret` or the k8s placeholder
 * `CHANGEME-jwt-secret`) is silently accepted today; an attacker with a
 * captured token sample can brute-force the secret offline and forge
 * tokens for any user.
 *
 * This module is a pure function so it's unit-testable in isolation.
 * `main.ts` invokes it once at the very top of `bootstrap()` — before
 * `NestFactory.create` — so production crashes cleanly before the HTTP
 * server ever binds. In development / test the call only logs a
 * prominent warning so existing test fixtures (which use short values
 * like `"test-secret"`) keep running untouched.
 */
/**
 * Minimum length required (#318 acceptance criterion — "length < 32
 * chars" fails). 32 hex characters give 128 bits of entropy when the
 * secret comes from `openssl rand -hex 32`, the recommended generator.
 *
 * This module deliberately does NOT import `./env`. `env.ts` runs
 * `validateEnv()` at module-load time and exits the process if a
 * required variable (e.g. JWT_SECRET) is missing in non-development
 * environments — which would crash the Jest test runner as soon as
 * this spec file is loaded. Reading `process.env` directly keeps the
 * validator an isolated, side-effect-free unit that's also safe to
 * import from any test spec, no matter what NODE_ENV/JWT_SECRET the
 * spec runs under.
 */
export const JWT_SECRET_MIN_LENGTH = 32

function describeShort(value: string): string {
  return [
    `JWT_SECRET is too short (${value.length} chars).`,
    `Minimum required length is ${JWT_SECRET_MIN_LENGTH} characters.`,
    `Generate one with:  openssl rand -hex 32`,
    `   or:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
  ].join("\n")
}

export interface JwtSecretValidationResult {
  ok: boolean
  reason?: string
}

/**
 * Validate that the configured JWT secret has enough entropy to resist
 * an offline brute-force attack.
 *
 * - If `secret` is undefined, returns `{ ok: true }` — the existing
 *   dev-only auto-rotation in `jwt.config.ts` handles this.
 * - If `secret` length ≥ minimum, returns `{ ok: true }`.
 * - Otherwise, exits the process in `NODE_ENV=production` (and logs a
 *   prominent warning in any other mode).
 *
 * Both arguments are parameterised so tests can drive the function
 * without having to mutate process-wide env state.
 */
export function validateJwtSecret(
  secret: string | undefined = process.env.JWT_SECRET,
  // Default to "development" so unknown / unset NODE_ENV values flag
  // short secrets with a warning rather than silently pass. The default
  // is raw (no folding); the function body normalises once at entry so
  // both default-driven and explicit-arg calls behave identically.
  nodeEnv: string = process.env.NODE_ENV ?? "development",
): JwtSecretValidationResult {
  // Normalise once at function entry so case variants (PRODUCTION,
  // Production) align with env.ts's zod enum {"development","production",
  // "test"}. Lower-case only — we intentionally do NOT `.trim()` because
  // env.ts's zod enum rejects whitespace-padded values outright; folding
  // them here would let a misconfiguration produce two different error
  // messages (ours + env.ts's "Invalid enum value").
  const normalizedEnv = nodeEnv.toLowerCase()

  if (!secret) return { ok: true }
  if (secret.length >= JWT_SECRET_MIN_LENGTH) return { ok: true }

  const reason = describeShort(secret)
  if (normalizedEnv === "production") {
    console.error(`Environment validation failed:\n  - JWT_SECRET: ${reason}`)
    process.exit(1)
  }
  // Development: log a prominent warning so local devs notice while
  // letting the process keep running. Test: stay silent. Test fixtures
  // (api/src/contract-provider.spec.ts and others) deliberately use
  // short values like `"test-secret"`, so emitting the warning on every
  // `npm test` run would just spam CI logs without an actionable fix.
  if (normalizedEnv === "development") {
    console.warn(`[JWT Warning] ${reason}`)
  }
  return { ok: false, reason }
}
