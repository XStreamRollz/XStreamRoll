import { JwtModuleOptions } from "@nestjs/jwt"
import { randomBytes } from "crypto"
import { env } from "./env"

export function createJwtConfig(expiresIn = "1h"): JwtModuleOptions {
  // Prefer the explicitly set env var, but fall back to validated env if present
  const secret = process.env.JWT_SECRET ?? env.JWT_SECRET

  if (!secret) {
    if (env.NODE_ENV === "development") {
      const generated = randomBytes(32).toString("hex")
      console.warn(
        "WARNING: No JWT_SECRET set; generating a random secret for development only. This is INSECURE for production."
      )
      console.warn(`Generated development JWT secret: ${generated}`)
      return { secret: generated, signOptions: { expiresIn } }
    }
    throw new Error("JWT_SECRET must be set")
  }

  return { secret, signOptions: { expiresIn } }
}

export default createJwtConfig
