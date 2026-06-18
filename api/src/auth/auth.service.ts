import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"
import type { Request } from "express"
import { RegisterDto } from "./dto/register.dto"
import { LoginDto } from "./dto/login.dto"
import { ForgotPasswordDto } from "./dto/forgot-password.dto"
import { ResetPasswordDto } from "./dto/reset-password.dto"
import { TokenDenylistService } from "./token-denylist.service"
import { User, UsersRepository } from "./users.repository"
import { PasswordResetService } from "./password-reset.service"
import { AuditService } from "../audit/audit.service"

/** Rounds for bcrypt key derivation (auto-salt). */
const BCRYPT_ROUNDS = 12

/** Public-safe user representation — never includes the password hash. */
export interface SafeUser {
  id: number
  username: string
  email: string
  createdAt: Date
}

export interface AuthResponse {
  user: SafeUser
  accessToken: string
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersRepository: UsersRepository,
    private readonly passwordResetService: PasswordResetService,
    private readonly tokenDenylistService: TokenDenylistService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Register a new user.
   *
   * Validates email and username uniqueness, hashes the password with bcrypt,
   * and returns a signed JWT together with a public-safe user object.
   * Logs registration failures with IP and user-agent for security monitoring.
   */
  async register(dto: RegisterDto, req: Request): Promise<AuthResponse> {
    const ip = this.extractClientIp(req)
    const userAgent = req.headers["user-agent"] ?? "unknown"

    const emailExists = await this.usersRepository.findByEmail(dto.email)
    if (emailExists) {
      await this.auditService.log(
        null,
        `AUTH_REGISTER_FAILURE: email_conflict (${dto.email})`,
        ip,
      )
      throw new ConflictException("email is already registered")
    }

    const usernameExists = await this.usersRepository.findByUsername(
      dto.username,
    )
    if (usernameExists) {
      await this.auditService.log(
        null,
        `AUTH_REGISTER_FAILURE: username_conflict (${dto.username})`,
        ip,
      )
      throw new ConflictException("username is already taken")
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)

    const user = await this.usersRepository.create(
      dto.username,
      dto.email,
      passwordHash,
    )

    await this.auditService.log(null, `AUTH_REGISTER_SUCCESS (${dto.email})`, ip)

    return {
      user: toSafeUser(user),
      accessToken: this.signToken(user),
    }
  }

  /**
   * Authenticate an existing user.
   *
   * Looks up the user by email, compares the provided password against
   * the stored bcrypt hash, and returns a JWT on success.
   * Logs all authentication failures with IP and user-agent for threat monitoring.
   */
  async login(dto: LoginDto, req: Request): Promise<AuthResponse> {
    const ip = this.extractClientIp(req)

    const user = await this.usersRepository.findByEmail(dto.email)
    if (!user) {
      await this.auditService.log(
        null,
        `AUTH_LOGIN_FAILURE: user_not_found (${dto.email})`,
        ip,
      )
      throw new UnauthorizedException("invalid email or password")
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash)
    if (!valid) {
      await this.auditService.log(
        user.id,
        `AUTH_LOGIN_FAILURE: invalid_password (${dto.email})`,
        ip,
      )
      throw new UnauthorizedException("invalid email or password")
    }

    await this.auditService.log(user.id, `AUTH_LOGIN_SUCCESS (${dto.email})`, ip)

    return {
      user: toSafeUser(user),
      accessToken: this.signToken(user),
    }
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    await this.passwordResetService.sendResetToken(dto.email)
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    await this.passwordResetService.resetPassword(dto.token, dto.password)
  }

  async logout(authorizationHeader: string): Promise<void> {
    const token = this.extractBearerToken(authorizationHeader)
    await this.verifyToken(token)

    const payload = this.jwtService.decode(token) as { exp?: number } | null
    const expiresAt = typeof payload?.exp === "number" ? payload.exp : undefined
    if (!expiresAt) {
      throw new UnauthorizedException("invalid access token")
    }

    const ttlSeconds = Math.floor(expiresAt - Date.now() / 1000)
    if (ttlSeconds <= 0) {
      throw new UnauthorizedException("access token has expired")
    }

    await this.tokenDenylistService.revoke(token, ttlSeconds)
  }

  private async verifyToken(token: string): Promise<void> {
    try {
      await this.jwtService.verifyAsync(token)
    } catch {
      throw new UnauthorizedException("invalid or expired access token")
    }
  }

  /**
   * Extract client IP from request.
   * Checks X-Forwarded-For header (for proxies) before falling back to connection IP.
   */
  private extractClientIp(req: Request): string {
    const xForwardedFor = req.headers["x-forwarded-for"]
    if (typeof xForwardedFor === "string") {
      return xForwardedFor.split(",")[0].trim()
    }
    if (Array.isArray(xForwardedFor)) {
      return xForwardedFor[0]
    }
    return req.ip ?? "unknown"
  }

  private extractBearerToken(header: string): string {
    const raw = header?.trim()
    if (!raw) {
      throw new UnauthorizedException(
        "Authorization header is required for logout",
      )
    }

    const match = raw.match(/^Bearer\s+(.+)$/i)
    if (!match) {
      throw new UnauthorizedException(
        "Authorization header must contain a Bearer token",
      )
    }

    return match[1]
  }

  /** Create a short-lived JWT access token for the given user. */
  private signToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      username: user.username,
      passwordChangedAt:
        user.password_changed_at?.getTime() ?? user.created_at.getTime(),
    })
  }
}

/** Strip the password hash from a user row before returning to clients. */
export function toSafeUser(row: User): SafeUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    createdAt: row.created_at,
  }
}
