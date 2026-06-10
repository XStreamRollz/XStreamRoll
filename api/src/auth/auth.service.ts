import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"
import { randomBytes } from "crypto"
import { UsersRepository } from "./users.repository"

const BCRYPT_ROUNDS = 10

function randomSuffix(): string {
  return randomBytes(6).toString("hex")
}

export interface TokenPayload {
  sub: number
  email: string
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly users: UsersRepository,
  ) {}

  /**
   * Register a new user account. Returns a JWT access token so the
   * caller is immediately authenticated after registration.
   *
   * Throws ConflictException when the email is already taken.
   */
  async register(
    email: string,
    password: string,
  ): Promise<{ access_token: string }> {
    const existing = await this.users.findByEmail(email)
    if (existing) {
      throw new ConflictException("Email is already registered")
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const username = `${email.split("@")[0]}_${randomSuffix()}`
    const user = await this.users.create(username, email, passwordHash)

    const token = this.generateToken(user.id, user.email)
    return { access_token: token }
  }

  /**
   * Authenticate an existing user with email + password.
   *
   * Throws UnauthorizedException when the email does not exist or the
   * password is incorrect. The error message is intentionally generic
   * to avoid user-enumeration attacks.
   */
  async login(
    email: string,
    password: string,
  ): Promise<{ access_token: string }> {
    const user = await this.users.findByEmail(email)
    if (!user) {
      throw new UnauthorizedException("Invalid credentials")
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials")
    }

    const token = this.generateToken(user.id, user.email)
    return { access_token: token }
  }

  /**
   * Issue a signed JWT for the given user identity.
   */
  generateToken(userId: number, email: string): string {
    const payload: TokenPayload = { sub: userId, email }
    return this.jwtService.sign(payload)
  }

  /**
   * Verify a JWT and return its decoded payload.
   *
   * Throws UnauthorizedException when the token is expired, malformed,
   * or signed with an unknown secret.
   */
  validateToken(token: string): TokenPayload {
    try {
      return this.jwtService.verify<TokenPayload>(token)
    } catch {
      throw new UnauthorizedException("Invalid or expired token")
    }
  }
}
