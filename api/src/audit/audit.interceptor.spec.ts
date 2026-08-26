import { lastValueFrom, of, throwError } from "rxjs"

import { AuditAction } from "./audit-action.enum"
import { AuditInterceptor } from "./audit.interceptor"
import { AuditService } from "./audit.service"

describe("AuditInterceptor", () => {
  let auditService: { logSafely: jest.Mock }
  let interceptor: AuditInterceptor

  beforeEach(() => {
    auditService = { logSafely: jest.fn().mockResolvedValue(undefined) }
    interceptor = new AuditInterceptor(auditService as unknown as AuditService)
  })

  interface RequestOverrides {
    auth?: { userId: number }
    headers?: Record<string, string | undefined>
    ip?: string
    params?: { id?: string }
  }

  function requestFor(
    method: string,
    path: string,
    overrides: RequestOverrides = {},
  ) {
    return {
      method,
      path,
      headers: { "x-forwarded-for": "203.0.113.7", ...overrides.headers },
      ip: overrides.ip ?? "127.0.0.1",
      params: overrides.params ?? {},
      ...(overrides.auth ? { auth: overrides.auth } : {}),
    }
  }

  async function runThroughInterceptor(
    method: string,
    path: string,
    overrides: RequestOverrides = {},
    handlerFails = false,
  ) {
    const req = requestFor(method, path, overrides)
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    }
    const next = {
      handle: () =>
        handlerFails ? throwError(() => new Error("boom")) : of({}),
    }
    await lastValueFrom(interceptor.intercept(context as never, next as never))
  }

  it("captures PATCH /users/me as PROFILE_UPDATE with the acting user id", async () => {
    await runThroughInterceptor("PATCH", "/users/me", { auth: { userId: 42 } })

    expect(auditService.logSafely).toHaveBeenCalledTimes(1)
    expect(auditService.logSafely).toHaveBeenCalledWith(
      42,
      AuditAction.PROFILE_UPDATE,
      {},
      "203.0.113.7",
    )
  })

  it("captures POST /users/me/change-password as PASSWORD_CHANGE with the acting user id", async () => {
    await runThroughInterceptor("POST", "/users/me/change-password", {
      auth: { userId: 42 },
    })

    expect(auditService.logSafely).toHaveBeenCalledTimes(1)
    expect(auditService.logSafely).toHaveBeenCalledWith(
      42,
      AuditAction.PASSWORD_CHANGE,
      {},
      "203.0.113.7",
    )
  })

  it("captures DELETE /streams/:id as STREAM_DELETE with the stream id in metadata and the acting user id", async () => {
    await runThroughInterceptor("DELETE", "/streams/7", {
      auth: { userId: 3 },
      params: { id: "7" },
    })

    expect(auditService.logSafely).toHaveBeenCalledTimes(1)
    expect(auditService.logSafely).toHaveBeenCalledWith(
      3,
      AuditAction.STREAM_DELETE,
      {},
      "203.0.113.7",
    )
  })

  it("captures DELETE /streams/:id when the request has a trailing slash", async () => {
    await runThroughInterceptor("DELETE", "/streams/7/", {
      auth: { userId: 3 },
      params: { id: "7" },
    })

    expect(auditService.logSafely).toHaveBeenCalledWith(
      3,
      AuditAction.STREAM_DELETE,
      {},
      expect.any(String),
    )
  })

  it("does not capture POST /auth/login: AuthService owns login auditing", async () => {
    await runThroughInterceptor("POST", "/auth/login")

    expect(auditService.logSafely).not.toHaveBeenCalled()
  })

  it("does not capture routes that do not exist", async () => {
    await runThroughInterceptor("POST", "/auth/password")
    await runThroughInterceptor("PATCH", "/users/role")
    // The real route is DELETE /streams/:id; the id-less path is not a route.
    await runThroughInterceptor("DELETE", "/streams")

    expect(auditService.logSafely).not.toHaveBeenCalled()
  })

  it("does not capture DELETE /streams/:id when the id is non-numeric", async () => {
    await runThroughInterceptor("DELETE", "/streams/abc", {
      params: { id: "abc" },
    })

    expect(auditService.logSafely).not.toHaveBeenCalled()
  })

  it("writes no audit row when the request handler fails", async () => {
    await expect(
      runThroughInterceptor(
        "PATCH",
        "/users/me",
        { auth: { userId: 1 } },
        true,
      ),
    ).rejects.toThrow("boom")

    expect(auditService.logSafely).not.toHaveBeenCalled()
  })

  it("records a NULL user id when the request carries no actor", async () => {
    await runThroughInterceptor("PATCH", "/users/me")

    expect(auditService.logSafely).toHaveBeenCalledTimes(1)
    expect(auditService.logSafely).toHaveBeenCalledWith(
      null,
      AuditAction.PROFILE_UPDATE,
      {},
      expect.any(String),
    )
  })
})
