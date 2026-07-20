import { randomBytes } from "crypto"

import { JwtModuleOptions } from "@nestjs/jwt"

import { env } from "./env"

export const JWT_ACCESS_TOKEN_EXPIRES_IN = "15m"

export function createJwtConfig(
  expiresIn = JWT_ACCESS_TOKEN_EXPIRES_IN,
): JwtModuleOptions {
  const secret = process.env.JWT_SECRET ?? env.JWT_SECRET

  if (!secret) {
    if (env.NODE_ENV === "development") {
      const generated = randomBytes(32).toString("hex")
      console.warn(
        "WARNING: No JWT_SECRET set; generating a random secret for development only. This is INSECURE for production.",
      )
      console.warn(`Generated development JWT secret: ${generated}`)
      return { secret: generated, signOptions: { expiresIn } }
    }
    throw new Error("JWT_SECRET must be set")
  }

  return { secret, signOptions: { expiresIn } }
}

export default createJwtConfig
