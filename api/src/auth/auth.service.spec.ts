import { ConflictException, UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"
import { AuthService, TokenPayload } from "./auth.service"
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
  verify: jest.Mock<TokenPayload>
}

interface MockUsersRepository {
  findByEmail: jest.Mock<Promise<User | null>>
  create: jest.Mock<Promise<User>>
}

function mockJwtService(): MockJwtService {
  return {
    sign: jest.fn(),
    verify: jest.fn(),
  }
}

function mockUsersRepository(): MockUsersRepository {
  return {
    findByEmail: jest.fn(),
    create: jest.fn(),
  }
}

function makeService(
  jwt: MockJwtService,
  users: MockUsersRepository,
): AuthService {
  return new AuthService(
    jwt as unknown as JwtService,
    users as unknown as UsersRepository,
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
  let service: AuthService

  beforeEach(() => {
    jwt = mockJwtService()
    users = mockUsersRepository()
    service = makeService(jwt, users)
    jest.clearAllMocks()
  })

  // -- register ----------------------------------------------------------

  describe("register", () => {
    const email = "new@example.com"
    const password = "strongPassword123"

    it("creates a user and returns an access token", async () => {
      users.findByEmail.mockResolvedValue(null)
      users.create.mockResolvedValue(dummyUser({ email }))
      jwt.sign.mockReturnValue("jwt.token.here")
      ;(bcrypt.hash as jest.Mock).mockResolvedValue("$2b$10$hashed")

      const result = await service.register(email, password)

      expect(users.findByEmail).toHaveBeenCalledWith(email)
      expect(users.create).toHaveBeenCalledWith(
        expect.stringMatching(/^new_/),
        email,
        "$2b$10$hashed",
      )
      expect(jwt.sign).toHaveBeenCalledWith({ sub: 1, email })
      expect(result.access_token).toBe("jwt.token.here")
    })

    it("throws ConflictException when the email is already taken", async () => {
      users.findByEmail.mockResolvedValue(dummyUser({ email }))

      await expect(service.register(email, password)).rejects.toThrow(
        ConflictException,
      )
      expect(users.create).not.toHaveBeenCalled()
    })

    it("hashes the password before storing it", async () => {
      users.findByEmail.mockResolvedValue(null)
      users.create.mockResolvedValue(dummyUser({ email }))
      jwt.sign.mockReturnValue("token")
      ;(bcrypt.hash as jest.Mock).mockResolvedValue("$2b$10$hashed")

      await service.register(email, password)

      expect(bcrypt.hash).toHaveBeenCalledWith(password, 10)
      const [_username, _email, storedHash] = users.create.mock.calls[0]
      expect(storedHash).toBe("$2b$10$hashed")
    })

    it("generates a unique username for each registration", async () => {
      users.findByEmail.mockResolvedValue(null)
      users.create.mockResolvedValue(dummyUser({ email }))
      jwt.sign.mockReturnValue("token")

      await service.register("foo@bar.com", password)

      const [username] = users.create.mock.calls[0]
      // Username should start with the email prefix and contain a random suffix.
      expect(username).toMatch(/^foo_/)
      expect(username.length).toBeGreaterThan("foo".length)
    })

    it("generates different usernames for the same email prefix", async () => {
      users.findByEmail.mockResolvedValue(null)
      users.create.mockResolvedValue(dummyUser({ email }))
      jwt.sign.mockReturnValue("token")

      await service.register("john@acme.com", password)
      const [u1] = users.create.mock.calls[0]

      await service.register("john@corp.com", password)
      const [u2] = users.create.mock.calls[1]

      expect(u1).not.toBe(u2)
    })

    it("rejects a duplicate email regardless of password", async () => {
      users.findByEmail.mockResolvedValue(dummyUser({ email: "dup@x.com" }))

      await expect(
        service.register("dup@x.com", "someOtherPassword"),
      ).rejects.toThrow(ConflictException)
    })
  })

  // -- login -------------------------------------------------------------

  describe("login", () => {
    const email = "existing@example.com"
    const password = "correctPassword"

    it("returns an access token when credentials are valid", async () => {
      const user = dummyUser({ email })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      jwt.sign.mockReturnValue("jwt.token.here")

      const result = await service.login(email, password)

      expect(users.findByEmail).toHaveBeenCalledWith(email)
      expect(bcrypt.compare).toHaveBeenCalledWith(password, user.password_hash)
      expect(jwt.sign).toHaveBeenCalledWith({ sub: user.id, email })
      expect(result.access_token).toBe("jwt.token.here")
    })

    it("throws UnauthorizedException when the email is not found", async () => {
      users.findByEmail.mockResolvedValue(null)

      await expect(service.login(email, password)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(jwt.sign).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the password is wrong", async () => {
      const user = dummyUser({ email })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)

      await expect(
        service.login(email, "wrongPassword"),
      ).rejects.toThrow(UnauthorizedException)

      expect(jwt.sign).not.toHaveBeenCalled()
    })

    it("uses the same error message for wrong password and missing email (anti-enumeration)", async () => {
      // Missing email scenario
      users.findByEmail.mockResolvedValueOnce(null)
      const e1 = await service.login("no@user.com", "any").catch((e) => e)
      expect(e1).toBeInstanceOf(UnauthorizedException)

      // Wrong password scenario
      users.findByEmail.mockResolvedValueOnce(dummyUser({ email }))
      ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(false)
      const e2 = await service
        .login(email, "bad")
        .catch((e) => e)
      expect(e2).toBeInstanceOf(UnauthorizedException)

      expect(e1.message).toBe(e2.message)
    })

    it("compares the raw password against the stored hash", async () => {
      const user = dummyUser({ email })
      users.findByEmail.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      jwt.sign.mockReturnValue("token")

      await service.login(email, password)

      expect(bcrypt.compare).toHaveBeenCalledWith(password, user.password_hash)
      expect(jwt.sign).toHaveBeenCalledWith({ sub: user.id, email })
    })
  })

  // -- generateToken -----------------------------------------------------

  describe("generateToken", () => {
    it("delegates to JwtService.sign with the correct payload", () => {
      jwt.sign.mockReturnValue("signed-jwt")

      const token = service.generateToken(42, "user@test.com")

      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 42,
        email: "user@test.com",
      })
      expect(token).toBe("signed-jwt")
    })
  })

  // -- validateToken -----------------------------------------------------

  describe("validateToken", () => {
    it("returns the decoded payload for a valid token", () => {
      const payload: TokenPayload = { sub: 7, email: "a@b.com" }
      jwt.verify.mockReturnValue(payload)

      const result = service.validateToken("valid.token")

      expect(jwt.verify).toHaveBeenCalledWith("valid.token")
      expect(result).toEqual(payload)
    })

    it("throws UnauthorizedException for an expired token", () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("jwt expired")
      })

      expect(() => service.validateToken("expired.token")).toThrow(
        UnauthorizedException,
      )
    })

    it("throws UnauthorizedException for a malformed token", () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("jwt malformed")
      })

      expect(() =>
        service.validateToken("not.a.real.token"),
      ).toThrow(UnauthorizedException)
    })

    it("throws UnauthorizedException for a token signed with a different secret", () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("invalid signature")
      })

      expect(() =>
        service.validateToken("foreign.signed.token"),
      ).toThrow(UnauthorizedException)
    })
  })
})
