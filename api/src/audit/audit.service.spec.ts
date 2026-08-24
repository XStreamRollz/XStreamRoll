import { Logger } from "@nestjs/common"

import { AuditAction } from "./audit-action.enum"
import { AuditService } from "./audit.service"

interface MockPool {
  query: jest.Mock
}

interface MockMetricsService {
  auditLogWriteFailuresTotal: { inc: jest.Mock }
}

function makeService(
  pool: MockPool,
  metrics?: MockMetricsService,
): AuditService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the pool only needs `query` for these tests
  return new AuditService(pool as any, metrics as any)
}

describe("AuditService", () => {
  let pool: MockPool
  let metrics: MockMetricsService
  let service: AuditService

  beforeEach(() => {
    pool = { query: jest.fn() }
    metrics = {
      auditLogWriteFailuresTotal: { inc: jest.fn() },
    }
    service = makeService(pool, metrics)
    jest.clearAllMocks()
  })

  describe("log (fail-closed primitive)", () => {
    it("inserts the audit row with stringified metadata", async () => {
      pool.query.mockResolvedValue({ rows: [] })

      await service.log(
        7,
        AuditAction.AUTH_LOGIN_FAILURE,
        { reason: "invalid_password" },
        "1.2.3.4",
      )

      expect(pool.query).toHaveBeenCalledWith(
        "INSERT INTO audit_logs (user_id, action, metadata, ip) VALUES ($1, $2, $3, $4)",
        [
          7,
          AuditAction.AUTH_LOGIN_FAILURE,
          JSON.stringify({ reason: "invalid_password" }),
          "1.2.3.4",
        ],
      )
    })

    it("throws on database errors — callers on primary paths must use logSafely", async () => {
      pool.query.mockRejectedValue(new Error("connection refused"))

      await expect(
        service.log(null, AuditAction.AUTH_LOGIN_FAILURE, {}, "1.2.3.4"),
      ).rejects.toThrow("connection refused")
    })
  })

  describe("logSafely (fail-open policy)", () => {
    it("resolves without throwing when the audit INSERT fails", async () => {
      pool.query.mockRejectedValue(new Error("connection refused"))

      await expect(
        service.logSafely(
          1,
          AuditAction.AUTH_LOGIN_SUCCESS,
          { email: "a@b.c" },
          "203.0.113.7",
        ),
      ).resolves.toBeUndefined()
    })

    it("logs the failed write with the action, user, and IP that would have been recorded", async () => {
      pool.query.mockRejectedValue(new Error("connection refused"))
      const errorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined)

      try {
        await service.logSafely(
          42,
          AuditAction.AUTH_LOGIN_SUCCESS,
          { email: "a@b.c" },
          "203.0.113.7",
        )

        const [message] = errorSpy.mock.calls[0]
        expect(String(message)).toContain("action=AUTH_LOGIN_SUCCESS")
        expect(String(message)).toContain("userId=42")
        expect(String(message)).toContain("ip=203.0.113.7")
      } finally {
        errorSpy.mockRestore()
      }
    })

    it("increments the audit write failure counter with the action label", async () => {
      pool.query.mockRejectedValue(new Error("timeout"))

      await service.logSafely(
        1,
        AuditAction.AUTH_REGISTER_SUCCESS,
        {},
        "1.2.3.4",
      )

      expect(metrics.auditLogWriteFailuresTotal.inc).toHaveBeenCalledWith({
        action: AuditAction.AUTH_REGISTER_SUCCESS,
      })
    })

    it("performs a single write on success — no retry, no double-write, no counter bump", async () => {
      pool.query.mockResolvedValue({ rows: [] })

      await service.logSafely(
        1,
        AuditAction.AUTH_LOGIN_SUCCESS,
        { email: "a@b.c" },
        "1.2.3.4",
      )

      expect(pool.query).toHaveBeenCalledTimes(1)
      expect(metrics.auditLogWriteFailuresTotal.inc).not.toHaveBeenCalled()
    })

    it("tolerates a missing metrics service (unit-test construction)", async () => {
      const bare = makeService(pool)
      pool.query.mockRejectedValue(new Error("down"))

      await expect(
        bare.logSafely(1, AuditAction.AUTH_LOGIN_SUCCESS, {}, "1.2.3.4"),
      ).resolves.toBeUndefined()
    })
  })
})
