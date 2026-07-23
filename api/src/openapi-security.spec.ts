// Prevent loading guard implementations, whose import chain triggers
// environment validation (process.exit) at import time.
jest.mock("./common/guards/stream-ownership.guard", () => ({
  StreamOwnershipGuard: class {
    canActivate() {
      return true
    }
  },
}))
jest.mock("./common/guards/auth.guard", () => ({
  AuthGuard: class {
    canActivate() {
      return true
    }
  },
}))

import { CACHE_MANAGER } from "@nestjs/cache-manager"
import { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"

import { AdminController } from "./admin/admin.controller"
import { AdminStatsService } from "./admin/admin-stats.service"
import { StreamsController } from "./streams/streams.controller"
import { StreamsService } from "./streams/streams.service"

type Operation = {
  security?: Array<Record<string, string[]>>
  responses?: Record<string, unknown>
}

type PathItem = Record<string, Operation>

/**
 * Generates the OpenAPI document for the controllers under test, mirroring
 * the scheme name ("bearer") declared in main.ts's DocumentBuilder so we can
 * assert that every auth-guarded route is correctly tagged in Swagger.
 */
async function buildOpenApiDoc(): Promise<{ paths: Record<string, PathItem> }> {
  const moduleRef = await Test.createTestingModule({
    controllers: [StreamsController, AdminController],
    providers: [
      { provide: StreamsService, useValue: {} },
      { provide: AdminStatsService, useValue: {} },
      { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn() } },
    ],
  }).compile()

  const app: INestApplication = moduleRef.createNestApplication()
  await app.init()

  const config = new DocumentBuilder()
    .setTitle("test")
    .setVersion("1.0.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearer")
    .build()

  const document = SwaggerModule.createDocument(app, config) as unknown as {
    paths: Record<string, PathItem>
  }

  await app.close()
  return document
}

/** Asserts an operation carries the bearer security requirement. */
function expectBearerSecured(op: Operation | undefined) {
  expect(op).toBeDefined()
  expect(op!.security).toEqual([{ bearer: [] }])
}

/** Asserts the presence/absence of 401 and 403 responses. */
function expectResponses(
  op: Operation | undefined,
  opts: { unauthorized: boolean; forbidden: boolean },
) {
  const responseKeys = Object.keys(op?.responses ?? {})
  expect(responseKeys.includes("401")).toBe(opts.unauthorized)
  expect(responseKeys.includes("403")).toBe(opts.forbidden)
}

describe("OpenAPI security markers", () => {
  let paths: Record<string, PathItem>

  beforeAll(async () => {
    paths = (await buildOpenApiDoc()).paths
  })

  it("POST /streams is bearer-secured with 401 only (AuthGuard)", () => {
    expectBearerSecured(paths["/streams"]?.post)
    expectResponses(paths["/streams"]?.post, {
      unauthorized: true,
      forbidden: false,
    })
  })

  it("GET /streams is bearer-secured with 401 only (AuthGuard)", () => {
    expectBearerSecured(paths["/streams"]?.get)
    expectResponses(paths["/streams"]?.get, {
      unauthorized: true,
      forbidden: false,
    })
  })

  it("GET /streams/{id} is bearer-secured with 401 and 403 (StreamOwnershipGuard)", () => {
    expectBearerSecured(paths["/streams/{id}"]?.get)
    expectResponses(paths["/streams/{id}"]?.get, {
      unauthorized: true,
      forbidden: true,
    })
  })

  it("PATCH /streams/{id} is bearer-secured with 401 and 403 (StreamOwnershipGuard)", () => {
    expectBearerSecured(paths["/streams/{id}"]?.patch)
    expectResponses(paths["/streams/{id}"]?.patch, {
      unauthorized: true,
      forbidden: true,
    })
  })

  it("DELETE /streams/{id} is bearer-secured with 401 and 403 (StreamOwnershipGuard)", () => {
    expectBearerSecured(paths["/streams/{id}"]?.delete)
    expectResponses(paths["/streams/{id}"]?.delete, {
      unauthorized: true,
      forbidden: true,
    })
  })

  it("GET /admin/stats is bearer-secured with 401 and 403 (RolesGuard admin)", () => {
    expectBearerSecured(paths["/admin/stats"]?.get)
    expectResponses(paths["/admin/stats"]?.get, {
      unauthorized: true,
      forbidden: true,
    })
  })
})
