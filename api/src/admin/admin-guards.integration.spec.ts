/**
 * Integration tests for the admin guard composition (issue #511).
 *
 * Proves the security contract end-to-end through real HTTP:
 * - No bearer token → 401 on both admin endpoints, even when the
 *   `X-Roles: admin` header is present (the header path is gone).
 * - Authenticated non-admin → 403.
 * - Authenticated admin → 200.
 *
 * The harness follows api/src/auth/auth-rate-limit.integration.spec.ts:
 * a real Nest application with the real guard chain and mocked
 * services, exercised via supertest.
 */
import { CACHE_MANAGER } from "@nestjs/cache-manager"
import { INestApplication, UnauthorizedException } from "@nestjs/common"
import { Test, TestingModule } from "@nestjs/testing"
import request from "supertest"

import { AdminAuditController } from "./admin-audit.controller"
import { AdminStatsService } from "./admin-stats.service"
import { AdminController } from "./admin.controller"
import { AuditService } from "../audit/audit.service"
import { AdminGuard } from "../common/auth/admin.guard"
import { RolesGuard } from "../common/auth/roles.guard"
import { AuthGuard } from "../common/guards/auth.guard"
import { JwtExtractorService } from "../common/guards/jwt-extractor.service"

describe("Admin endpoints — guard composition (Integration)", () => {
  let app: INestApplication

  const mockJwtExtractor = {
    authenticate: jest.fn(),
    extractBearerToken: jest.fn(),
  }
  const mockAuditService = { findAll: jest.fn() }
  const mockStatsService = { compute: jest.fn() }
  const mockCache = { get: jest.fn(), set: jest.fn() }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminController, AdminAuditController],
      providers: [
        { provide: JwtExtractorService, useValue: mockJwtExtractor },
        { provide: AuditService, useValue: mockAuditService },
        { provide: AdminStatsService, useValue: mockStatsService },
        { provide: CACHE_MANAGER, useValue: mockCache },
        AuthGuard,
        RolesGuard,
        AdminGuard,
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
    mockCache.get.mockResolvedValue(null)
    mockStatsService.compute.mockResolvedValue({
      totalUsers: 3,
      totalStreams: 5,
      activeStreams: 2,
      eventsLast24h: 10,
      generatedAt: "2026-08-24T00:00:00.000Z",
    })
    mockAuditService.findAll.mockResolvedValue({
      data: [{ id: 1, action: "AUTH_LOGIN_SUCCESS" }],
      total: 1,
      page: 1,
      limit: 20,
    })
  })

  describe("GET /admin/audit-logs", () => {
    it("returns 401 without a bearer token", async () => {
      mockJwtExtractor.authenticate.mockRejectedValue(
        new UnauthorizedException(
          "Authorization header must contain a Bearer token",
        ),
      )

      const res = await request(app.getHttpServer()).get("/admin/audit-logs")

      expect(res.status).toBe(401)
      expect(mockAuditService.findAll).not.toHaveBeenCalled()
    })

    it("returns 401 for X-Roles: admin with no bearer token — the header grants nothing", async () => {
      mockJwtExtractor.authenticate.mockRejectedValue(
        new UnauthorizedException(
          "Authorization header must contain a Bearer token",
        ),
      )

      const res = await request(app.getHttpServer())
        .get("/admin/audit-logs")
        .set("X-Roles", "admin")

      expect(res.status).toBe(401)
      expect(mockAuditService.findAll).not.toHaveBeenCalled()
    })

    it("returns 403 for an authenticated non-admin user", async () => {
      mockJwtExtractor.authenticate.mockResolvedValue({
        userId: 1,
        isAdmin: false,
      })

      const res = await request(app.getHttpServer())
        .get("/admin/audit-logs")
        .set("Authorization", "Bearer non-admin-token")

      expect(res.status).toBe(403)
      expect(mockAuditService.findAll).not.toHaveBeenCalled()
    })

    it("returns 403 for a non-admin user even when they send X-Roles: admin", async () => {
      mockJwtExtractor.authenticate.mockResolvedValue({
        userId: 1,
        isAdmin: false,
      })

      const res = await request(app.getHttpServer())
        .get("/admin/audit-logs")
        .set("Authorization", "Bearer non-admin-token")
        .set("X-Roles", "admin")

      expect(res.status).toBe(403)
      expect(mockAuditService.findAll).not.toHaveBeenCalled()
    })

    it("returns 200 for an authenticated admin user", async () => {
      mockJwtExtractor.authenticate.mockResolvedValue({
        userId: 1,
        isAdmin: true,
      })

      const res = await request(app.getHttpServer())
        .get("/admin/audit-logs")
        .set("Authorization", "Bearer admin-token")

      expect(res.status).toBe(200)
      expect(mockAuditService.findAll).toHaveBeenCalledWith(1, 20)
      expect(res.body.data).toHaveLength(1)
    })
  })

  describe("GET /admin/stats", () => {
    it("returns 401 without a bearer token", async () => {
      mockJwtExtractor.authenticate.mockRejectedValue(
        new UnauthorizedException(
          "Authorization header must contain a Bearer token",
        ),
      )

      const res = await request(app.getHttpServer()).get("/admin/stats")

      expect(res.status).toBe(401)
      expect(mockStatsService.compute).not.toHaveBeenCalled()
    })

    it("returns 401 for X-Roles: admin with no bearer token", async () => {
      mockJwtExtractor.authenticate.mockRejectedValue(
        new UnauthorizedException(
          "Authorization header must contain a Bearer token",
        ),
      )

      const res = await request(app.getHttpServer())
        .get("/admin/stats")
        .set("X-Roles", "admin")

      expect(res.status).toBe(401)
      expect(mockStatsService.compute).not.toHaveBeenCalled()
    })

    it("returns 403 for an authenticated non-admin user", async () => {
      mockJwtExtractor.authenticate.mockResolvedValue({
        userId: 1,
        isAdmin: false,
      })

      const res = await request(app.getHttpServer())
        .get("/admin/stats")
        .set("Authorization", "Bearer non-admin-token")

      expect(res.status).toBe(403)
      expect(mockStatsService.compute).not.toHaveBeenCalled()
    })

    it("returns 200 with a snapshot for an authenticated admin user", async () => {
      mockJwtExtractor.authenticate.mockResolvedValue({
        userId: 1,
        isAdmin: true,
      })

      const res = await request(app.getHttpServer())
        .get("/admin/stats")
        .set("Authorization", "Bearer admin-token")

      expect(res.status).toBe(200)
      expect(res.body.totalUsers).toBe(3)
    })
  })
})
