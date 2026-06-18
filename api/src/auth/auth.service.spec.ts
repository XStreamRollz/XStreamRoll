import { ConflictException, UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"
import { AuthService } from "./auth.service"
import { User, UsersRepository } from "./users.repository"
import { TokenDenylistService } from "./token-denylist.service"
import { PasswordResetService } from "./password-reset.service"

jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockJwtService {
  sign: jest.Mock<string>
  verifyAsync: jest.Mock<Promise<unknown>>
  decode: jest.Mock<unknown>
}

interface MockUsersRepository {
  findByEmail: jest.Mock<Promise<User | null>>
  findByUsername: jest.Mock<Promise<User | null>>
  create: jest.Mock<Promise<User>>
}

interface MockPasswordResetService {
  sendResetToken: jest.Mock<Promise<void>>
  resetPassword: jest.Mock<Promise<void>>
}

interface MockTokenDenylistService {
  revoke: jest.Mock<Promise<void>>
}

function mockJwtService(): MockJwtService {
  return {
    sign: jest.fn(),
    verifyAsync: jest.fn(),
    decode: jest.fn(),
  }
}

function mockUsersRepository(): MockUsersRepository {
  return {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    create: jest.fn(),
  }
}

function mockPasswordResetService(): MockPasswordResetService {
  return {
    sendResetToken: jest.fn(),
    resetPassword: jest.fn(),
  }
}

function makeService(
  jwt: MockJwtService,
  users: MockUsersRepository,
  passwordReset: MockPasswordResetService,
  tokenDenylist: MockTokenDenylistService,
): AuthService {
  return new AuthService(
    jwt as unknown as JwtService,
    users as unknown as UsersRepository,
    passwordReset as unknown as PasswordResetService,
    tokenDenylist as unknown as TokenDenylistService,
  )
}

function dummyUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    username: "testuser",
    email: "test@example.com",
    password_hash:
      "$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12",
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuthService", () => {
  let jwt: MockJwtService
  let users: MockUsersRepository
  let passwordReset: MockPasswordResetService
  let tokenDenylist: MockTokenDenylistService
  let service: AuthService

  beforeEach(() => {
    jwt = mockJwtService()
    users = mockUsersRepository()
    passwordReset = mockPasswordResetService()
    tokenDenylist = { revoke: jest.fn() }
    service = makeService(jwt, users, passwordReset, tokenDenylist)
    jest.clearAllMocks()
  })

  // -- register ----------------------------------------------------------

  describe("register", () => {
    const dto = {
      username: "newuser",
      email: "new@example.com",
      password: "strongPassword123",
    }

    it("creates a user and returns an access token with user profile", async () => {
      users.findByEmail.mockResolvedValue(null)
      users.findByUsername.mockResolvedValue(null)
      users.create.mockResolvedValue(
        dummyUser({ email: dto.email, username: dto.username }),
      )
      jwt.sign.mockReturnValue("jwt.token.here")
      ;(bcrypt.hash as jest.Mock).mockResolvedValue("$2b$10$hashed")

      const result = await service.register(dto)

      expect(users.findByEmail).toHaveBeenCalledWith(dto.email)
      expect(users.findByUsername).toHaveBeenCalledWith(dto.username)
      expect(users.create).toHaveBeenCalledWith(
        dto.username,
        dto.email,
        "$2b$10$hashed",
      )
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 1,
        email: dto.email,
        username: dto.username,
        passwordChangedAt: expect.any(Number),
      })
      expect(result.accessToken).toBe("jwt.token.here")
      expect(result.user).toEqual({
        id: 1,
        username: dto.username,
        email: dto.email,
        createdAt: expect.any(Date),
      })
    })

    it("throws ConflictException when the email is already taken", async () => {
      users.findByEmail.mockResolvedValue(dummyUser({ email: dto.email }))

      await expect(service.register(dto)).rejects.toThrow(ConflictException)
      expect(users.create).not.toHaveBeenCalled()
    })

    it("throws ConflictException when the username is already taken", async () => {
      users.findByEmail.mockResolvedValue(null)
      users.findByUsername.mockResolvedValue(
        dummyUser({ username: dto.username }),
      )

      await expect(service.register(dto)).rejects.toThrow(ConflictException)
      expect(users.create).not.toHaveBeenCalled()
    })

    it("hashes the password before storing it", async () => {
      users.findByEmail.mockResolvedValue(null)
      users.findByUsername.mockResolvedValue(null)
      users.create.mockResolvedValue(dummyUser({ email: dto.email }))
      jwt.sign.mockReturnValue("token")
      ;(bcrypt.hash as jest.Mock).mockResolvedValue("$2b$10$hashed")

      await service.register(dto)

      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 12)
      const [storedUsername, storedEmail, storedHash] =
        users.create.mock.calls[0]
      expect(storedUsername).toBe(dto.username)
      expect(storedEmail).toBe(dto.email)
      expect(storedHash).toBe("$2b$10$hashed")
    })

    it("rejects a duplicate email regardless of password", async () => {
      users.findByEmail.mockResolvedValue(dummyUser({ email: "dup@x.com" }))

      await expect(
        service.register({
          username: "dupuser",
          email: "dup@x.com",
          password: "someOtherPassword",
        }),
      ).rejects.toThrow(ConflictException)
    })
  })

  // -- forgot password --------------------------------------------------

  describe("forgotPassword", () => {
    it("delegates reset requests to the password reset service", async () => {
      const dto = { email: "user@x.com" }
      passwordReset.sendResetToken.mockResolvedValue(undefined)

      await service.forgotPassword(dto)

      expect(passwordReset.sendResetToken).toHaveBeenCalledWith(dto.email)
    })
  })

  // -- reset password ---------------------------------------------------

  describe("resetPassword", () => {
    it("delegates password resets to the password reset service", async () => {
      const dto = {
        token: "reset-token",
        password: "NewP4ssw0rd!",
      }
      passwordReset.resetPassword.mockResolvedValue(undefined)

      await service.resetPassword(dto)

      expect(passwordReset.resetPassword).toHaveBeenCalledWith(
        dto.token,
        dto.password,
      )
    })
  })

  // -- login -------------------------------------------------------------

  describe("logout", () => {
    const token = "valid.jwt.token"

    it("revokes the current access token when valid", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 1 })
      jwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 300 })

      await service.logout(`Bearer ${token}`)

      expect(jwt.verifyAsync).toHaveBeenCalledWith(token)
      expect(jwt.decode).toHaveBeenCalledWith(token)
      expect(tokenDenylist.revoke).toHaveBeenCalledWith(
        token,
        expect.any(Number),
      )
    })

    it("throws UnauthorizedException when the authorization header is missing", async () => {
      await expect(service.logout("")).rejects.toThrow(UnauthorizedException)
      expect(tokenDenylist.revoke).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the token is invalid", async () => {
      jwt.verifyAsync.mockRejectedValue(new Error("invalid token"))

      await expect(service.logout(`Bearer ${token}`)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(tokenDenylist.revoke).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the token has already expired", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 1 })
      jwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) - 10 })

      await expect(service.logout(`Bearer ${token}`)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(tokenDenylist.revoke).not.toHaveBeenCalled()
    })
  })

  describe("login", () => {
    const dto = { email: "existing@example.com", password: "correctPassword" }

    it("returns an access token and user profile when credentials are valid", async () => {
      const user = dummyUser({ email: dto.email })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      jwt.sign.mockReturnValue("jwt.token.here")

      const result = await service.login(dto)

      expect(users.findByEmail).toHaveBeenCalledWith(dto.email)
      expect(bcrypt.compare).toHaveBeenCalledWith(
        dto.password,
        user.password_hash,
      )
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: dto.email,
        username: user.username,
        passwordChangedAt: expect.any(Number),
      })
      expect(result.accessToken).toBe("jwt.token.here")
      expect(result.user).toEqual({
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
      })
    })

    it("throws UnauthorizedException when the email is not found", async () => {
      users.findByEmail.mockResolvedValue(null)

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)
      expect(jwt.sign).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the password is wrong", async () => {
      const user = dummyUser({ email: dto.email })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)

      await expect(
        service.login({ email: dto.email, password: "wrongPassword" }),
      ).rejects.toThrow(UnauthorizedException)

      expect(jwt.sign).not.toHaveBeenCalled()
    })

    it("uses the same error message for wrong password and missing email (anti-enumeration)", async () => {
      // Missing email scenario
      users.findByEmail.mockResolvedValueOnce(null)
      const e1 = await service
        .login({ email: "no@user.com", password: "any" })
        .catch((e) => e)
      expect(e1).toBeInstanceOf(UnauthorizedException)

      // Wrong password scenario
      users.findByEmail.mockResolvedValueOnce(dummyUser({ email: dto.email }))
      ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(false)
      const e2 = await service
        .login({ email: dto.email, password: "bad" })
        .catch((e) => e)
      expect(e2).toBeInstanceOf(UnauthorizedException)

      expect(e1.message).toBe(e2.message)
    })

    it("compares the raw password against the stored hash", async () => {
      const user = dummyUser({ email: dto.email })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      jwt.sign.mockReturnValue("token")

      await service.login(dto)

      expect(bcrypt.compare).toHaveBeenCalledWith(
        dto.password,
        user.password_hash,
      )
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: dto.email,
        username: user.username,
        passwordChangedAt: expect.any(Number),
      })
    })
  })
})
