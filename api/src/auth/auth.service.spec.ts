import { ConflictException, UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"
import { AuthService } from "./auth.service"
import { User, UsersRepository } from "./users.repository"
import { TokenDenylistService } from "./token-denylist.service"

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
  findById: jest.Mock<Promise<User | null>>
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
    findById: jest.fn(),
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
  accessJwt: MockJwtService,
  refreshJwt: MockJwtService,
  users: MockUsersRepository,
  passwordReset: MockPasswordResetService,
  tokenDenylist: MockTokenDenylistService,
): AuthService {
  return new AuthService(
    refreshJwt as unknown as JwtService,
    accessJwt as unknown as JwtService,
    users as unknown as UsersRepository,
    passwordReset as unknown as any,
    tokenDenylist as unknown as TokenDenylistService,
    { log: jest.fn() } as any
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
  let accessJwt: MockJwtService
  let refreshJwt: MockJwtService
  let users: MockUsersRepository
  let passwordReset: MockPasswordResetService
  let tokenDenylist: MockTokenDenylistService
  let service: AuthService

  beforeEach(() => {
    accessJwt = mockJwtService()
    refreshJwt = mockJwtService()
    users = mockUsersRepository()
    passwordReset = mockPasswordResetService()
    tokenDenylist = { revoke: jest.fn() }
    service = makeService(accessJwt, refreshJwt, users, passwordReset, tokenDenylist)
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
      accessJwt.sign.mockReturnValue("jwt.token.here")
      refreshJwt.sign.mockReturnValue("refresh.token.here")
      ;(bcrypt.hash as jest.Mock).mockResolvedValue("$2b$10$hashed")

      const result = await service.register(dto, { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any)

      expect(users.findByEmail).toHaveBeenCalledWith(dto.email)
      expect(users.findByUsername).toHaveBeenCalledWith(dto.username)
      expect(users.create).toHaveBeenCalledWith(
        dto.username,
        dto.email,
        "$2b$10$hashed",
      )
      expect(accessJwt.sign).toHaveBeenCalledWith({
        sub: 1,
        email: dto.email,
        username: dto.username,
        passwordChangedAt: expect.any(Number),
      })
      expect(refreshJwt.sign).toHaveBeenCalledWith({
        sub: 1,
        email: dto.email,
        username: dto.username,
        passwordChangedAt: expect.any(Number),
      })
      expect(result.accessToken).toBe("jwt.token.here")
      expect(result.refreshToken).toBe("refresh.token.here")
      expect(result.user).toEqual({
        id: "1",
        username: dto.username,
        email: dto.email,
        createdAt: expect.any(String),
      })
    })

    it("throws ConflictException when the email is already taken", async () => {
      users.findByEmail.mockResolvedValue(dummyUser({ email: dto.email }))

      await expect(service.register(dto, { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any)).rejects.toThrow(ConflictException)
      expect(users.create).not.toHaveBeenCalled()
    })

    it("throws ConflictException when the username is already taken", async () => {
      users.findByEmail.mockResolvedValue(null)
      users.findByUsername.mockResolvedValue(
        dummyUser({ username: dto.username }),
      )

      await expect(service.register(dto, { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any)).rejects.toThrow(ConflictException)
      expect(users.create).not.toHaveBeenCalled()
    })

    it("hashes the password before storing it", async () => {
      users.findByEmail.mockResolvedValue(null)
      users.findByUsername.mockResolvedValue(null)
      users.create.mockResolvedValue(dummyUser({ email: dto.email }))
      accessJwt.sign.mockReturnValue("token")
      refreshJwt.sign.mockReturnValue("refresh")
      ;(bcrypt.hash as jest.Mock).mockResolvedValue("$2b$10$hashed")

      await service.register(dto, { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any)

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
        }, { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any),
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

      expect(passwordReset.resetPassword).toHaveBeenCalledWith(dto.token, dto.password)
    })
  })

  // -- login -------------------------------------------------------------

  describe("login", () => {
    const dto = { email: "existing@example.com", password: "correctPassword" }

    it("returns an access token and user profile when credentials are valid", async () => {
      const user = dummyUser({ email: dto.email })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      accessJwt.sign.mockReturnValue("jwt.token.here")
      refreshJwt.sign.mockReturnValue("refresh.token.here")

      const result = await service.login(dto, { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any)

      expect(users.findByEmail).toHaveBeenCalledWith(dto.email)
      expect(bcrypt.compare).toHaveBeenCalledWith(
        dto.password,
        user.password_hash,
      )
      expect(accessJwt.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        username: user.username,
        passwordChangedAt: expect.any(Number),
      })
      expect(refreshJwt.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        username: user.username,
        passwordChangedAt: expect.any(Number),
      })
      expect(result.accessToken).toBe("jwt.token.here")
      expect(result.refreshToken).toBe("refresh.token.here")
      expect(result.user).toEqual({
        id: String(user.id),
        username: user.username,
        email: user.email,
        createdAt: user.created_at.toISOString(),
      })
    })

    it("throws UnauthorizedException when the email is not found", async () => {
      users.findByEmail.mockResolvedValue(null)

      await expect(service.login(dto, { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any)).rejects.toThrow(UnauthorizedException)
      expect(accessJwt.sign).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the password is wrong", async () => {
      const user = dummyUser({ email: dto.email })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)

      await expect(
        service.login({ email: dto.email, password: "wrongPassword" }, { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any),
      ).rejects.toThrow(UnauthorizedException)

      expect(accessJwt.sign).not.toHaveBeenCalled()
    })

    it("uses the same error message for wrong password and missing email (anti-enumeration)", async () => {
      // Missing email scenario
      users.findByEmail.mockResolvedValueOnce(null)
      const e1 = await service
        .login({ email: "no@user.com", password: "any" }, { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any)
        .catch((e) => e)
      expect(e1).toBeInstanceOf(UnauthorizedException)

      // Wrong password scenario
      users.findByEmail.mockResolvedValueOnce(dummyUser({ email: dto.email }))
      ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(false)
      const e2 = await service
        .login({ email: dto.email, password: "bad" }, { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any)
        .catch((e) => e)
      expect(e2).toBeInstanceOf(UnauthorizedException)

      expect(e1.message).toBe(e2.message)
    })

    it("compares the raw password against the stored hash", async () => {
      const user = dummyUser({ email: dto.email })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      accessJwt.sign.mockReturnValue("token")
      refreshJwt.sign.mockReturnValue("refresh")

      await service.login(dto, { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any)

      expect(bcrypt.compare).toHaveBeenCalledWith(
        dto.password,
        user.password_hash,
      )
      expect(accessJwt.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        username: user.username,
        passwordChangedAt: expect.any(Number),
      })
      expect(refreshJwt.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        username: user.username,
        passwordChangedAt: expect.any(Number),
      })
    })
  })

  // -- logout ------------------------------------------------------------

  describe("logout", () => {
    const token = "valid.jwt.token"
    const refreshToken = "valid.refresh.token"

    it("revokes the current access token when valid", async () => {
      accessJwt.verifyAsync.mockResolvedValue({ sub: 1 })
      accessJwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 300 })
      refreshJwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 300 })

      await service.logout(`Bearer ${token}`, refreshToken)

      expect(accessJwt.verifyAsync).toHaveBeenCalledWith(token)
      expect(accessJwt.decode).toHaveBeenCalledWith(token)
      expect(tokenDenylist.revoke).toHaveBeenCalledWith(
        token,
        expect.any(Number),
      )
      expect(refreshJwt.decode).toHaveBeenCalledWith(refreshToken)
      expect(tokenDenylist.revoke).toHaveBeenCalledWith(
        refreshToken,
        expect.any(Number),
      )
    })

    it("revokes only the access token when no refresh token is provided", async () => {
      accessJwt.verifyAsync.mockResolvedValue({ sub: 1 })
      accessJwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 300 })

      await service.logout(`Bearer ${token}`)

      expect(tokenDenylist.revoke).toHaveBeenCalledWith(
        token,
        expect.any(Number),
      )
      expect(tokenDenylist.revoke).toHaveBeenCalledTimes(1)
    })

    it("throws UnauthorizedException when the authorization header is missing", async () => {
      await expect(service.logout("", refreshToken)).rejects.toThrow(UnauthorizedException)
      expect(tokenDenylist.revoke).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the token is invalid", async () => {
      accessJwt.verifyAsync.mockRejectedValue(new Error("invalid token"))

      await expect(service.logout(`Bearer ${token}`, refreshToken)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(tokenDenylist.revoke).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the token has already expired", async () => {
      accessJwt.verifyAsync.mockResolvedValue({ sub: 1 })
      accessJwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) - 10 })

      await expect(service.logout(`Bearer ${token}`, refreshToken)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(tokenDenylist.revoke).not.toHaveBeenCalled()
    })
  })

  // -- refresh -----------------------------------------------------------

  describe("refresh", () => {
    const refreshToken = "valid.refresh.token"

    it("returns a new access token when refresh token is valid", async () => {
      refreshJwt.verifyAsync.mockResolvedValue({ sub: 1 })
      refreshJwt.decode.mockReturnValue({ sub: 1 })
      users.findById.mockResolvedValue(dummyUser())
      accessJwt.sign.mockReturnValue("new.access.token")
      refreshJwt.sign.mockReturnValue("new.refresh.token")

      const req = { cookies: { refresh_token: refreshToken } } as any
      const result = await service.refresh(req)

      expect(result.accessToken).toBe("new.access.token")
      expect(result.refreshToken).toBe("new.refresh.token")
      expect(refreshJwt.verifyAsync).toHaveBeenCalledWith(refreshToken)
      expect(users.findById).toHaveBeenCalledWith(1)
    })

    it("throws UnauthorizedException when refresh token is missing", async () => {
      const req = { cookies: {} } as any
      await expect(service.refresh(req)).rejects.toThrow(UnauthorizedException)
    })

    it("throws UnauthorizedException when refresh token is invalid", async () => {
      refreshJwt.verifyAsync.mockRejectedValue(new Error("invalid"))

      const req = { cookies: { refresh_token: refreshToken } } as any
      await expect(service.refresh(req)).rejects.toThrow(UnauthorizedException)
    })

    it("throws UnauthorizedException when user is not found", async () => {
      refreshJwt.verifyAsync.mockResolvedValue({ sub: 999 })
      refreshJwt.decode.mockReturnValue({ sub: 999 })
      users.findById.mockResolvedValue(null)

      const req = { cookies: { refresh_token: refreshToken } } as any
      await expect(service.refresh(req)).rejects.toThrow(UnauthorizedException)
    })
  })
})
