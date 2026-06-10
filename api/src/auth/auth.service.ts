import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"
import { Pool } from "pg"
import { RegisterDto } from "./dto/register.dto"
import { LoginDto } from "./dto/login.dto"

/** Rounds for bcrypt key derivation (auto-salt). */
const BCRYPT_ROUNDS = 12

/** Row shape returned by the users table queries. */
interface UserRow {
  id: number
  username: string
  email: string
  password_hash: string
  created_at: Date
}

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
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Register a new user.
   *
   * Validates email uniqueness, hashes the password with bcrypt, and
   * returns a signed JWT together with a public-safe user object.
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const emailExists = await this.emailTaken(dto.email)
    if (emailExists) {
      throw new ConflictException("email is already registered")
    }

    const usernameExists = await this.usernameTaken(dto.username)
    if (usernameExists) {
      throw new ConflictException("username is already taken")
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)

    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, password_hash, created_at`,
      [dto.username, dto.email, passwordHash],
    )

    const user = rows[0]
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
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, username, email, password_hash, created_at
       FROM users
       WHERE email = $1`,
      [dto.email],
    )

    const user = rows[0]
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
    }
  }

  /** Create a short-lived JWT access token for the given user. */
  private signToken(user: UserRow): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      username: user.username,
    })
  }

  /** Check whether an email address is already in use. */
  private async emailTaken(email: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) AS exists",
      [email],
    )
    return rows[0]?.exists ?? false
  }

  /** Check whether a username is already in use. */
  private async usernameTaken(username: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM users WHERE username = $1) AS exists",
      [username],
    )
    return rows[0]?.exists ?? false
  }
}

/** Strip the password hash from a user row before returning to clients. */
function toSafeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    createdAt: row.created_at,
  }
}
