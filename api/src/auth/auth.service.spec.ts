import { ConflictException, UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"

import { AuthService } from "./auth.service"
import { TokenDenylistService } from "./token-denylist.service"
import { User, UsersRepository } from "./users.repository"

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
  decodeJti: jest.Mock<string>
  isRevoked: jest.Mock<Promise<boolean>>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PasswordResetService is typed separately via the mock interface
    passwordReset as unknown as any,
    tokenDenylist as unknown as TokenDenylistService,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Logger mock only needs `log`
    { log: jest.fn() } as any,
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
    is_admin: false,
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
    tokenDenylist = {
      revoke: jest.fn(),
      decodeJti: jest.fn(),
      isRevoked: jest.fn(),
    }
    service = makeService(
      accessJwt,
      refreshJwt,
      users,
      passwordReset,
      tokenDenylist,
    )
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      const result = await service.register(dto, {
        ip: "127.0.0.1",
        headers: { "user-agent": "test" },
      } as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test

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
        jti: expect.any(String),
      })
      expect(refreshJwt.sign).toHaveBeenCalledWith({
        sub: 1,
        email: dto.email,
        username: dto.username,
        passwordChangedAt: expect.any(Number),
        jti: expect.any(String),
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      await expect(
        service.register(dto, {
          ip: "127.0.0.1",
          headers: { "user-agent": "test" },
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test, // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test
      ).rejects.toThrow(ConflictException)
      expect(users.create).not.toHaveBeenCalled()
    })

    it("throws ConflictException when the username is already taken", async () => {
      users.findByEmail.mockResolvedValue(null)
      users.findByUsername.mockResolvedValue(
        dummyUser({ username: dto.username }),
      )

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      await expect(
        service.register(dto, {
          ip: "127.0.0.1",
          headers: { "user-agent": "test" },
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test, // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test
      ).rejects.toThrow(ConflictException)
      expect(users.create).not.toHaveBeenCalled()
    })

    it("hashes the password before storing it", async () => {
      users.findByEmail.mockResolvedValue(null)
      users.findByUsername.mockResolvedValue(null)
      users.create.mockResolvedValue(dummyUser({ email: dto.email }))
      accessJwt.sign.mockReturnValue("token")
      refreshJwt.sign.mockReturnValue("refresh")
      ;(bcrypt.hash as jest.Mock).mockResolvedValue("$2b$10$hashed")

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      await service.register(dto, {
        ip: "127.0.0.1",
        headers: { "user-agent": "test" },
      } as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test

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
        service.register(
          {
            username: "dupuser",
            email: "dup@x.com",
            password: "someOtherPassword",
          },
          { ip: "127.0.0.1", headers: { "user-agent": "test" } } as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test
        ), // eslint-disable-line @typescript-eslint/no-explicit-any
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

  describe("login", () => {
    const dto = { email: "existing@example.com", password: "correctPassword" }

    it("returns an access token and user profile when credentials are valid", async () => {
      const user = dummyUser({ email: dto.email })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      accessJwt.sign.mockReturnValue("jwt.token.here")
      refreshJwt.sign.mockReturnValue("refresh.token.here")

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      const result = await service.login(dto, {
        ip: "127.0.0.1",
        headers: { "user-agent": "test" },
      } as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test

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
        jti: expect.any(String),
      })
      expect(refreshJwt.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        username: user.username,
        passwordChangedAt: expect.any(Number),
        jti: expect.any(String),
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      await expect(
        service.login(dto, {
          ip: "127.0.0.1",
          headers: { "user-agent": "test" },
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test, // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test
      ).rejects.toThrow(UnauthorizedException)
      expect(accessJwt.sign).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the password is wrong", async () => {
      const user = dummyUser({ email: dto.email })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
        service.login({ email: dto.email, password: "wrongPassword" }, {
          ip: "127.0.0.1",
          headers: { "user-agent": "test" },
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test, // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test
      ).rejects.toThrow(UnauthorizedException)

      expect(accessJwt.sign).not.toHaveBeenCalled()
    })

    it("uses the same error message for wrong password and missing email (anti-enumeration)", async () => {
      // Missing email scenario
      users.findByEmail.mockResolvedValueOnce(null)
      const e1 = await service
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
        .login({ email: "no@user.com", password: "any" }, {
          ip: "127.0.0.1",
          headers: { "user-agent": "test" },
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test
        .catch((e) => e)
      expect(e1).toBeInstanceOf(UnauthorizedException)

      // Wrong password scenario
      users.findByEmail.mockResolvedValueOnce(dummyUser({ email: dto.email }))
      ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(false)
      const e2 = await service
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
        .login({ email: dto.email, password: "bad" }, {
          ip: "127.0.0.1",
          headers: { "user-agent": "test" },
        } as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      await service.login(dto, {
        ip: "127.0.0.1",
        headers: { "user-agent": "test" },
      } as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test

      expect(bcrypt.compare).toHaveBeenCalledWith(
        dto.password,
        user.password_hash,
      )
      expect(accessJwt.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        username: user.username,
        passwordChangedAt: expect.any(Number),
        jti: expect.any(String),
      })
      expect(refreshJwt.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        username: user.username,
        passwordChangedAt: expect.any(Number),
        jti: expect.any(String),
      })
    })

    it("carries isAdmin: true in the access token when the user is flagged admin", async () => {
      const user = dummyUser({ email: dto.email, is_admin: true })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      accessJwt.sign.mockReturnValue("jwt.token.here")
      refreshJwt.sign.mockReturnValue("refresh.token.here")

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      await service.login(dto, {
        ip: "127.0.0.1",
        headers: { "user-agent": "test" },
      } as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- partial request stub for test

      expect(accessJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ isAdmin: true }),
      )
    })
  })

  // -- logout ------------------------------------------------------------

  describe("logout", () => {
    const token = "valid.jwt.token"
    const refreshToken = "valid.refresh.token"
    const accessJti = "access-jti-111"
    const refreshJti = "refresh-jti-222"

    it("revokes the current access token when valid", async () => {
      accessJwt.verifyAsync.mockResolvedValue({ sub: 1 })
      accessJwt.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 300,
      })
      refreshJwt.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 300,
      })
      tokenDenylist.decodeJti.mockReturnValueOnce(accessJti)
      tokenDenylist.decodeJti.mockReturnValueOnce(refreshJti)

      await service.logout(`Bearer ${token}`, refreshToken)

      expect(accessJwt.verifyAsync).toHaveBeenCalledWith(token)
      expect(accessJwt.decode).toHaveBeenCalledWith(token)
      // Issue #510: revoke is keyed on the decoded jti — never the raw
      // token string (the raw-token call hashed a different cache key and
      // the revocation silently never took effect).
      expect(tokenDenylist.decodeJti).toHaveBeenCalledWith(token)
      expect(tokenDenylist.revoke).toHaveBeenCalledWith(
        accessJti,
        expect.any(Number),
      )
      expect(refreshJwt.decode).toHaveBeenCalledWith(refreshToken)
      expect(tokenDenylist.decodeJti).toHaveBeenCalledWith(refreshToken)
      expect(tokenDenylist.revoke).toHaveBeenCalledWith(
        refreshJti,
        expect.any(Number),
      )
    })

    it("revokes only the access token when no refresh token is provided", async () => {
      accessJwt.verifyAsync.mockResolvedValue({ sub: 1 })
      accessJwt.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 300,
      })
      tokenDenylist.decodeJti.mockReturnValue(accessJti)

      await service.logout(`Bearer ${token}`)

      expect(tokenDenylist.decodeJti).toHaveBeenCalledWith(token)
      expect(tokenDenylist.revoke).toHaveBeenCalledWith(
        accessJti,
        expect.any(Number),
      )
      expect(tokenDenylist.revoke).toHaveBeenCalledTimes(1)
    })

    it("throws UnauthorizedException when the authorization header is missing", async () => {
      await expect(service.logout("", refreshToken)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(tokenDenylist.revoke).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the token is invalid", async () => {
      accessJwt.verifyAsync.mockRejectedValue(new Error("invalid token"))

      await expect(
        service.logout(`Bearer ${token}`, refreshToken),
      ).rejects.toThrow(UnauthorizedException)
      expect(tokenDenylist.revoke).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the token has already expired", async () => {
      accessJwt.verifyAsync.mockResolvedValue({ sub: 1 })
      accessJwt.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) - 10,
      })

      await expect(
        service.logout(`Bearer ${token}`, refreshToken),
      ).rejects.toThrow(UnauthorizedException)
      expect(tokenDenylist.revoke).not.toHaveBeenCalled()
    })
  })

  // -- refresh -----------------------------------------------------------

  describe("refresh", () => {
    const refreshToken = "valid.refresh.token"

    it("returns a new access token when refresh token is valid", async () => {
      refreshJwt.verifyAsync.mockResolvedValue({ sub: 1 })
      refreshJwt.decode.mockReturnValue({ sub: 1, jti: "refresh-jti" })
      users.findById.mockResolvedValue(dummyUser())
      accessJwt.sign.mockReturnValue("new.access.token")
      refreshJwt.sign.mockReturnValue("new.refresh.token")
      tokenDenylist.isRevoked.mockResolvedValue(false)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      const req = { cookies: { refresh_token: refreshToken } } as any
      const result = await service.refresh(req)

      expect(result.accessToken).toBe("new.access.token")
      expect(result.refreshToken).toBe("new.refresh.token")
      expect(refreshJwt.verifyAsync).toHaveBeenCalledWith(refreshToken)
      // Issue #510: refresh consults the denylist before minting a new pair.
      expect(tokenDenylist.isRevoked).toHaveBeenCalledWith("refresh-jti")
      expect(users.findById).toHaveBeenCalledWith(1)
    })

    it("throws UnauthorizedException when the refresh token is revoked (issue #510)", async () => {
      refreshJwt.verifyAsync.mockResolvedValue({ sub: 1 })
      refreshJwt.decode.mockReturnValue({ sub: 1, jti: "revoked-refresh-jti" })
      tokenDenylist.isRevoked.mockResolvedValue(true)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      const req = { cookies: { refresh_token: refreshToken } } as any

      await expect(service.refresh(req)).rejects.toThrow(UnauthorizedException)
      await expect(service.refresh(req)).rejects.toThrow(
        "refresh token has been revoked",
      )
      expect(users.findById).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when refresh token is missing", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      const req = { cookies: {} } as any
      await expect(service.refresh(req)).rejects.toThrow(UnauthorizedException)
    })

    it("throws UnauthorizedException when refresh token is invalid", async () => {
      refreshJwt.verifyAsync.mockRejectedValue(new Error("invalid"))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      const req = { cookies: { refresh_token: refreshToken } } as any
      await expect(service.refresh(req)).rejects.toThrow(UnauthorizedException)
    })

    it("throws UnauthorizedException when user is not found", async () => {
      refreshJwt.verifyAsync.mockResolvedValue({ sub: 999 })
      refreshJwt.decode.mockReturnValue({ sub: 999 })
      users.findById.mockResolvedValue(null)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial request stub for test
      const req = { cookies: { refresh_token: refreshToken } } as any
      await expect(service.refresh(req)).rejects.toThrow(UnauthorizedException)
    })
  })

  // -- refresh -----------------------------------------------------------

  describe("refresh", () => {
    it("returns new token pair for a valid refresh token", async () => {
      const user = dummyUser()
      jwt.verify.mockReturnValue({ sub: user.id })
      users.findById.mockResolvedValue(user)
      jwt.sign.mockReturnValueOnce("new.access.token").mockReturnValueOnce("new.refresh.token")

      const result = await service.refresh("valid.refresh.token")

      expect(jwt.verify).toHaveBeenCalledWith("valid.refresh.token")
      expect(users.findById).toHaveBeenCalledWith(user.id)
      expect(result.accessToken).toBe("new.access.token")
      expect(result.refreshToken).toBe("new.refresh.token")
      expect(result.user).toEqual({
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
      })
    })

    it("throws UnauthorizedException when the refresh token is invalid or expired", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("jwt expired")
      })

      await expect(service.refresh("expired.token")).rejects.toThrow(
        UnauthorizedException,
      )
      expect(users.findById).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the user no longer exists", async () => {
      jwt.verify.mockReturnValue({ sub: 999 })
      users.findById.mockResolvedValue(null)

      await expect(service.refresh("valid.for.deleted.user")).rejects.toThrow(
        UnauthorizedException,
      )
      expect(jwt.sign).not.toHaveBeenCalled()
    })

    it("signs the access token with the standard short-lived payload", async () => {
      const user = dummyUser()
      jwt.verify.mockReturnValue({ sub: user.id })
      users.findById.mockResolvedValue(user)
      jwt.sign
        .mockReturnValueOnce("access")
        .mockReturnValueOnce("refresh")

      await service.refresh("token")

      // First call: access token (short-lived, full claims)
      expect(jwt.sign).toHaveBeenNthCalledWith(1, {
        sub: user.id,
        email: user.email,
        username: user.username,
      })
      // Second call: refresh token (long-lived, sub only)
      expect(jwt.sign).toHaveBeenNthCalledWith(
        2,
        { sub: user.id },
        { expiresIn: "7d" },
      )
    })
  })
})
