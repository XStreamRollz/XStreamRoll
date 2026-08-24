import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"
import { RegisterDto } from "./dto/register.dto"
import { LoginDto } from "./dto/login.dto"
import { User, UsersRepository } from "./users.repository"

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
  refreshToken: string
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersRepository: UsersRepository,
  ) {}

  /**
   * Register a new user.
   *
   * Validates email and username uniqueness, hashes the password with bcrypt,
   * and returns a signed JWT together with a public-safe user object.
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const emailExists = await this.usersRepository.findByEmail(dto.email)
    if (emailExists) {
      throw new ConflictException("email is already registered")
    }

    const usernameExists = await this.usersRepository.findByUsername(
      dto.username,
    )
    if (usernameExists) {
      throw new ConflictException("username is already taken")
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)

    const user = await this.usersRepository.create(
      dto.username,
      dto.email,
      passwordHash,
    )

    return {
      user: toSafeUser(user),
      accessToken: this.signToken(user),
      refreshToken: this.signRefreshToken(user),
    }
  }

  /**
   * Authenticate an existing user.
   *
   * Looks up the user by email, compares the provided password against
   * the stored bcrypt hash, and returns a JWT on success.
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersRepository.findByEmail(dto.email)
    if (!user) {
      throw new UnauthorizedException("invalid email or password")
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash)
    if (!valid) {
      throw new UnauthorizedException("invalid email or password")
    }

    return {
      user: toSafeUser(user),
      accessToken: this.signToken(user),
      refreshToken: this.signRefreshToken(user),
    }
  }

  /**
   * Refresh an access token using a valid refresh token.
   *
   * Accepts the refresh token either from the request body (SDK path) or
   * from the httpOnly cookie (browser proxy path). Validates the token,
   * looks up the user, and returns a fresh token pair.
   */
  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: { sub: number }
    try {
      payload = this.jwtService.verify<{ sub: number }>(refreshToken)
    } catch {
      throw new UnauthorizedException("invalid or expired refresh token")
    }

    const user = await this.usersRepository.findById(payload.sub)
    if (!user) {
      throw new UnauthorizedException("user not found")
    }

    return {
      user: toSafeUser(user),
      accessToken: this.signToken(user),
      refreshToken: this.signRefreshToken(user),
    }
  }

  /** Create a short-lived JWT access token for the given user. */
  private signToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      username: user.username,
    })
  }

  /** Create a long-lived JWT refresh token for the given user. */
  private signRefreshToken(user: User): string {
    return this.jwtService.sign(
      { sub: user.id },
      { expiresIn: "7d" },
    )
  }
}

/** Strip the password hash from a user row before returning to clients. */
function toSafeUser(row: User): SafeUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    createdAt: row.created_at,
  }
}
