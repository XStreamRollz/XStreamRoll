import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"

import { UsersService } from "./users.service"
import { TokenDenylistService } from "../auth/token-denylist.service"
import { User, UsersRepository } from "../auth/users.repository"

jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}))

function dummyUser(overrides: Partial<User> = {}): User {
  return {
    id: 7,
    username: "testuser",
    email: "test@example.com",
    password_hash: "hashed",
    created_at: new Date("2026-01-01T00:00:00Z"),
    is_admin: false,
    ...overrides,
  }
}

describe("UsersService", () => {
  let service: UsersService
  let jwtService: { sign: jest.Mock; decode: jest.Mock }
  let users: {
    findById: jest.Mock
    findByEmail: jest.Mock
    findByUsername: jest.Mock
    updateProfile: jest.Mock
    updatePasswordHash: jest.Mock
  }
  let denylist: { revoke: jest.Mock; decodeJti: jest.Mock }
  let audit: { log: jest.Mock }

  beforeEach(() => {
    jwtService = { sign: jest.fn(), decode: jest.fn() }
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      updateProfile: jest.fn(),
      updatePasswordHash: jest.fn(),
    }
    denylist = { revoke: jest.fn(), decodeJti: jest.fn() }
    audit = { log: jest.fn() }

    service = new UsersService(
      jwtService as unknown as JwtService,
      users as unknown as UsersRepository,
      denylist as unknown as TokenDenylistService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- audit mock needs only log
      audit as any,
    )
  })

  describe("updateProfile (email change)", () => {
    const user = dummyUser({ email: "old@example.com" })
    const updated = dummyUser({ email: "new@example.com" })

    it("revokes the presented token by its decoded jti and mints a new one", async () => {
      users.findById.mockResolvedValue(user)
      users.findByEmail.mockResolvedValue(null)
      users.updateProfile.mockResolvedValue(updated)
      denylist.decodeJti.mockReturnValue("profile-jti-123")
      jwtService.sign.mockReturnValue("new.token")

      const result = await service.updateProfile(
        7,
        { email: "new@example.com" },
        "Bearer a.b.c",
      )

      // Issue #510: revoke is keyed on the decoded jti, never the raw token.
      expect(denylist.decodeJti).toHaveBeenCalledWith("a.b.c")
      expect(denylist.revoke).toHaveBeenCalledWith("profile-jti-123", 3600)
      // The replacement token carries a jti so it can be revoked too.
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ jti: expect.any(String) }),
      )
      expect(result.accessToken).toBeDefined()
    })

    it("does not revoke anything when the email is unchanged", async () => {
      users.findById.mockResolvedValue(user)
      users.updateProfile.mockResolvedValue(user)

      const result = await service.updateProfile(
        7,
        { email: "old@example.com" },
        "Bearer a.b.c",
      )

      expect(denylist.revoke).not.toHaveBeenCalled()
      expect(result.accessToken).toBeUndefined()
    })
  })

  describe("changePassword", () => {
    it("revokes the presented token by its decoded jti and mints a new one", async () => {
      const user = dummyUser()
      const updated = dummyUser({
        password_hash: "new-hash",
      })
      users.findById.mockResolvedValue(user)
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)
      users.updatePasswordHash.mockResolvedValue(updated)
      denylist.decodeJti.mockReturnValue("password-jti-456")
      jwtService.sign.mockReturnValue("new.token")

      const result = await service.changePassword(
        7,
        { currentPassword: "old", newPassword: "newPass123" },
        "Bearer x.y.z",
      )

      expect(bcrypt.compare).toHaveBeenCalledWith("old", user.password_hash)
      // Issue #510: revoke by jti, not the raw token.
      expect(denylist.decodeJti).toHaveBeenCalledWith("x.y.z")
      expect(denylist.revoke).toHaveBeenCalledWith("password-jti-456", 3600)
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ jti: expect.any(String) }),
      )
      expect(result.accessToken).toBeDefined()
    })

    it("throws when the current password is incorrect and revokes nothing", async () => {
      users.findById.mockResolvedValue(dummyUser())
      ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)

      await expect(
        service.changePassword(
          7,
          { currentPassword: "wrong", newPassword: "newPass123" },
          "Bearer x.y.z",
        ),
      ).rejects.toThrow("current password is incorrect")

      expect(denylist.revoke).not.toHaveBeenCalled()
    })
  })
})
