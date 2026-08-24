/**
 * End-to-end coverage for login auditing (issue #523).
 *
 * Login used to be double-logged: `AuthService.login()` wrote
 * `AUTH_LOGIN_SUCCESS` / `AUTH_LOGIN_FAILURE` with full metadata while the
 * global `AuditInterceptor` wrote a second bare `login` row for the same
 * request. This suite boots the real `AuthController` with the real
 * `AuditInterceptor` and a recording `AuditService`, then asserts that a
 * single login attempt produces exactly one audit row — and that failure
 * paths are still logged by `AuthService` with metadata.
 */
import { INestApplication } from "@nestjs/common"
import { APP_INTERCEPTOR } from "@nestjs/core"
import { JwtService } from "@nestjs/jwt"
import { Test } from "@nestjs/testing"
import * as bcrypt from "bcrypt"
import request from "supertest"

import { AuditAction } from "./audit-action.enum"
import { AuditInterceptor } from "./audit.interceptor"
import { AuditService } from "./audit.service"
import { AuthController } from "../auth/auth.controller"
import { AuthService } from "../auth/auth.service"
import { PasswordResetService } from "../auth/password-reset.service"
import { TokenDenylistService } from "../auth/token-denylist.service"
import { User, UsersRepository } from "../auth/users.repository"

jest.mock("bcrypt", () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}))

describe("Login audit (integration)", () => {
  let app: INestApplication

  const auditService = { log: jest.fn().mockResolvedValue(undefined) }
  const usersRepository = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  }
  const jwt = {
    sign: jest.fn().mockReturnValue("signed.token"),
    verifyAsync: jest.fn(),
    decode: jest.fn(),
  }
  const tokenDenylistService = { revoke: jest.fn() }
  const passwordResetService = {
    sendResetToken: jest.fn(),
    resetPassword: jest.fn(),
  }

  const user: User = {
    id: 1,
    username: "testuser",
    email: "test@example.com",
    password_hash:
      "$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12",
    created_at: new Date("2026-01-01T00:00:00Z"),
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
        { provide: AuditService, useValue: auditService },
        AuthService,
        { provide: JwtService, useValue: jwt },
        { provide: "JWT_REFRESH", useValue: jwt },
        { provide: UsersRepository, useValue: usersRepository },
        { provide: TokenDenylistService, useValue: tokenDenylistService },
        { provide: PasswordResetService, useValue: passwordResetService },
      ],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("writes exactly one audit row for a successful login", async () => {
    usersRepository.findByEmail.mockResolvedValue(user)
    ;(bcrypt.compare as jest.Mock).mockResolvedValue(true)

    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email, password: "correctPassword" })

    expect(res.status).toBe(200)
    expect(auditService.log).toHaveBeenCalledTimes(1)
    expect(auditService.log).toHaveBeenCalledWith(
      user.id,
      AuditAction.AUTH_LOGIN_SUCCESS,
      { email: user.email },
      expect.any(String),
    )
  })

  it("writes exactly one audit row with metadata when the password is wrong", async () => {
    usersRepository.findByEmail.mockResolvedValue(user)
    ;(bcrypt.compare as jest.Mock).mockResolvedValue(false)

    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email, password: "wrongPassword" })

    expect(res.status).toBe(401)
    expect(auditService.log).toHaveBeenCalledTimes(1)
    expect(auditService.log).toHaveBeenCalledWith(
      user.id,
      AuditAction.AUTH_LOGIN_FAILURE,
      { reason: "invalid_password", email: user.email },
      expect.any(String),
    )
  })

  it("writes exactly one audit row with metadata when the email is unknown", async () => {
    usersRepository.findByEmail.mockResolvedValue(null)

    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" })

    expect(res.status).toBe(401)
    expect(auditService.log).toHaveBeenCalledTimes(1)
    expect(auditService.log).toHaveBeenCalledWith(
      null,
      AuditAction.AUTH_LOGIN_FAILURE,
      { reason: "user_not_found", email: "nobody@example.com" },
      expect.any(String),
    )
  })
})
