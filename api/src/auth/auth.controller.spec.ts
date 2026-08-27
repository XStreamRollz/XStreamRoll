import { UnauthorizedException } from "@nestjs/common"

import { AuthController } from "./auth.controller"
import { AuthResponse, AuthService } from "./auth.service"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockAuthService {
  refresh: jest.Mock<Promise<AuthResponse>>
}

function mockAuthService(): MockAuthService {
  return {
    refresh: jest.fn(),
  }
}

function makeController(service: MockAuthService): AuthController {
  return new AuthController(service as unknown as AuthService)
}

function authResponse(): AuthResponse {
  return {
    user: {
      id: "1",
      username: "testuser",
      email: "test@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    accessToken: "access.token",
    refreshToken: "refresh.token",
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuthController", () => {
  let service: MockAuthService
  let controller: AuthController

  beforeEach(() => {
    service = mockAuthService()
    controller = makeController(service)
    jest.clearAllMocks()
  })

  describe("refresh", () => {
    it("forwards the body refresh token to the service", async () => {
      service.refresh.mockResolvedValue(authResponse())

      const result = await controller.refresh("body.token", undefined)

      expect(service.refresh).toHaveBeenCalledWith("body.token")
      expect(result).toEqual(authResponse())
    })

    it("falls back to the refresh_token cookie when no body token is present", async () => {
      service.refresh.mockResolvedValue(authResponse())

      const result = await controller.refresh(undefined, {
        cookies: { refresh_token: "cookie.token" },
      })

      expect(service.refresh).toHaveBeenCalledWith("cookie.token")
      expect(result).toEqual(authResponse())
    })

    it("prefers the body token over the cookie when both are present", async () => {
      service.refresh.mockResolvedValue(authResponse())

      await controller.refresh("body.token", {
        cookies: { refresh_token: "cookie.token" },
      })

      expect(service.refresh).toHaveBeenCalledWith("body.token")
      expect(service.refresh).not.toHaveBeenCalledWith("cookie.token")
    })

    it("throws UnauthorizedException when neither body token nor cookie is provided", () => {
      expect(() => controller.refresh(undefined, undefined)).toThrow(
        UnauthorizedException,
      )
      expect(service.refresh).not.toHaveBeenCalled()
    })

    it("throws UnauthorizedException when the cookie is empty", () => {
      expect(() => controller.refresh(undefined, { cookies: {} })).toThrow(
        UnauthorizedException,
      )
      expect(service.refresh).not.toHaveBeenCalled()
    })
  })
})
