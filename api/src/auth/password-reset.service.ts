import {
  BadRequestException,
  CACHE_MANAGER,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common"
import { Cache } from "cache-manager"
import { Pool } from "pg"
import * as bcrypt from "bcrypt"
import * as crypto from "crypto"
import { UsersRepository } from "./users.repository"

const PASSWORD_RESET_TOKEN_BYTES = 32
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000
const MAX_ATTEMPTS_PER_EMAIL = 3
const RATE_LIMIT_TTL_SECONDS = 60 * 60
const BCRYPT_ROUNDS = 12

@Injectable()
export class PasswordResetService {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })
  private readonly logger = new Logger(PasswordResetService.name)

  constructor(
    private readonly usersRepository: UsersRepository,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async sendResetToken(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase()
    const rateKey = `password-reset:forgot:${normalizedEmail}`

    const currentAttempts = (await this.cache.get<number>(rateKey)) ?? 0
    if (currentAttempts >= MAX_ATTEMPTS_PER_EMAIL) {
      this.logger.warn(
        `Password reset request rate limited for ${normalizedEmail}`,
      )
      return
    }
    await this.cache.set(rateKey, currentAttempts + 1, {
      ttl: RATE_LIMIT_TTL_SECONDS,
    })

    const user = await this.usersRepository.findByEmail(normalizedEmail)
    if (!user) {
      return
    }

    const token = await this.createResetToken(user.id)
    await this.sendResetEmail(normalizedEmail, token)
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const tokenHash = this.hashToken(token)
    const { rows } = await this.pool.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used = false
         AND expires_at > NOW()`,
      [tokenHash],
    )

    const row = rows[0]
    if (!row) {
      throw new BadRequestException("invalid or expired reset token")
    }

    const user = await this.usersRepository.findById(row.user_id)
    if (!user) {
      throw new BadRequestException("invalid or expired reset token")
    }

    const normalizedEmail = user.email.trim().toLowerCase()
    const rateKey = `password-reset:reset:${normalizedEmail}`
    const currentAttempts = (await this.cache.get<number>(rateKey)) ?? 0
    if (currentAttempts >= MAX_ATTEMPTS_PER_EMAIL) {
      this.logger.warn(
        `Password reset execution rate limited for ${normalizedEmail}`,
      )
      throw new BadRequestException("invalid or expired reset token")
    }
    await this.cache.set(rateKey, currentAttempts + 1, {
      ttl: RATE_LIMIT_TTL_SECONDS,
    })

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const passwordChangedAt = new Date()

    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        `UPDATE password_reset_tokens
         SET used = true
         WHERE id = $1`,
        [row.id],
      )
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             password_changed_at = $2
         WHERE id = $3`,
        [passwordHash, passwordChangedAt, row.user_id],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }

  private async createResetToken(userId: number): Promise<string> {
    const token = crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("hex")
    const tokenHash = this.hashToken(token)
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS)

    await this.pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    )

    return token
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex")
  }

  private async sendResetEmail(email: string, token: string): Promise<void> {
    const resetUrlBase = process.env.RESET_PASSWORD_URL_BASE
    const resetUrl = resetUrlBase
      ? `${resetUrlBase.replace(/\/?$/, "")}?token=${encodeURIComponent(token)}`
      : token

    this.logger.log(
      `Password reset token ready for ${email}. Use the token or URL: ${resetUrl}`,
    )
  }
}
