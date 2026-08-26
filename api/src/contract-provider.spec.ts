/**
 * Provider verification for tests/contracts/.
 *
 * Boots the real controllers and services behind supertest — no mocked
 * business logic — swapping only the Postgres-backed edges (repositories,
 * the audit log, the JWT denylist cache) for in-memory equivalents so the
 * suite runs without a live database. Every interaction in
 * `@xstreamroll/contract-tests` is executed against this app and its
 * response is validated against the contract's zod schema. If the API's
 * actual response ever stops matching what the SDK is entitled to expect,
 * this suite — not a runtime error at some consumer's callsite — is what
 * catches it.
 */
import { CacheModule } from "@nestjs/cache-manager"
import { INestApplication, ValidationPipe } from "@nestjs/common"
import { JwtModule, JwtService } from "@nestjs/jwt"
import { Test, TestingModule } from "@nestjs/testing"
import {
  authContracts,
  loginBody,
  notificationsContracts,
  PLACEHOLDER,
  registerBody,
  resolvePath,
  streamsContracts,
  webhooksContracts,
  type Contract,
} from "@xstreamroll/contract-tests"
import request from "supertest"

import { AuditService } from "./audit/audit.service"
import { AuthController } from "./auth/auth.controller"
import { AuthService } from "./auth/auth.service"
import { PasswordResetService } from "./auth/password-reset.service"
import { TokenDenylistService } from "./auth/token-denylist.service"
import { User, UsersRepository } from "./auth/users.repository"
import { AuthGuard } from "./common/guards/auth.guard"
import { JwtExtractorService } from "./common/guards/jwt-extractor.service"
import { StreamOwnershipGuard } from "./common/guards/stream-ownership.guard"
import { StreamOwnershipService } from "./common/guards/stream-ownership.service"
import createJwtConfig, { createRefreshJwtConfig } from "./config/jwt.config"
import { NotificationsController } from "./notifications/notifications.controller"
import { NotificationsService } from "./notifications/notifications.service"
import { NotificationsRepository } from "./notifications/repository/notifications.repository"
import { StreamsRepository } from "./streams/repository/streams.repository"
import { StreamApiKeyGuard } from "./streams/stream-api-key.guard"
import { StreamsController } from "./streams/streams.controller"
import { StreamsService } from "./streams/streams.service"
import { TagsRepository } from "./tags/repository/tags.repository"
import { StreamTagsController } from "./tags/tags.controller"
import { TagsService } from "./tags/tags.service"
import { WebhookDeliveriesRepository } from "./webhooks/repository/webhook-deliveries.repository"
import { WebhookSubscriptionsRepository } from "./webhooks/repository/webhook-subscriptions.repository"
import { WebhooksController } from "./webhooks/webhooks.controller"
import { WebhooksService } from "./webhooks/webhooks.service"

process.env.JWT_SECRET ??= "test-secret"
process.env.STREAM_API_KEY ??= "test-stream-key"

/** In-memory double for the Postgres-backed UsersRepository. */
class InMemoryUsersRepository {
  private readonly byId = new Map<number, User>()
  private nextId = 1

  async findByEmail(email: string): Promise<User | null> {
    return [...this.byId.values()].find((u) => u.email === email) ?? null
  }

  async findByUsername(username: string): Promise<User | null> {
    return [...this.byId.values()].find((u) => u.username === username) ?? null
  }

  async findById(id: number): Promise<User | null> {
    return this.byId.get(id) ?? null
  }

  async create(
    username: string,
    email: string,
    passwordHash: string,
  ): Promise<User> {
    const user: User = {
      id: this.nextId++,
      username,
      email,
      password_hash: passwordHash,
      created_at: new Date(),
      is_admin: false,
    }
    this.byId.set(user.id, user)
    return user
  }
}

describe("Contract provider verification (api)", () => {
  let app: INestApplication
  let jwtService: JwtService
  let streamsRepository: StreamsRepository
  let subscriptionsRepository: WebhookSubscriptionsRepository
  let deliveriesRepository: WebhookDeliveriesRepository
  let accessToken: string
  let userId: number
  let existingStreamId: string
  let existingWebhookId: string
  let existingDeliveryId: string

  beforeAll(async () => {
    streamsRepository = new StreamsRepository()
    subscriptionsRepository = new WebhookSubscriptionsRepository()
    deliveriesRepository = new WebhookDeliveriesRepository()

    /** Checks ownership against the same in-memory repository StreamsService uses. */
    const streamOwnershipService = {
      ownsStream: async (candidateUserId: number, streamId: number) => {
        const stream = await streamsRepository.findById(streamId)
        return stream?.userId === candidateUserId
      },
    }

    const tokenDenylistService = {
      isRevoked: async () => false,
      revoke: async () => undefined,
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.registerAsync({ useFactory: () => createJwtConfig() }),
        CacheModule.register(),
      ],
      controllers: [
        StreamsController,
        StreamTagsController,
        AuthController,
        WebhooksController,
        NotificationsController,
      ],
      providers: [
        StreamsService,
        TagsService,
        TagsRepository,
        { provide: StreamsRepository, useValue: streamsRepository },
        WebhooksService,
        {
          provide: WebhookSubscriptionsRepository,
          useValue: subscriptionsRepository,
        },
        {
          provide: WebhookDeliveriesRepository,
          useValue: deliveriesRepository,
        },
        NotificationsService,
        NotificationsRepository,
        AuthGuard,
        JwtExtractorService,
        StreamOwnershipGuard,
        StreamApiKeyGuard,
        { provide: StreamOwnershipService, useValue: streamOwnershipService },
        { provide: TokenDenylistService, useValue: tokenDenylistService },
        AuthService,
        // AuthService also depends on a second, named JwtService instance
        // for refresh tokens via `@Inject("JWT_REFRESH")`. AuthModule wires
        // this with `JwtModule.registerAsync({ name: "JWT_REFRESH", ... })`,
        // but @nestjs/jwt@10.2.0's public API has no `name` option — it's
        // silently ignored, so that registration never actually creates a
        // "JWT_REFRESH" provider token. (Confirmed against the installed
        // package's JwtModuleOptions type and jwt.module.js — there's no
        // multi-instance support at all in this version.) AuthModule's
        // wiring is broken the same way in the real app, not just here;
        // this manual provider is the correct fix, scoped to this test only
        // since fixing AuthModule itself is outside what this suite owns.
        {
          provide: "JWT_REFRESH",
          useFactory: () => new JwtService(createRefreshJwtConfig()),
        },
        { provide: UsersRepository, useClass: InMemoryUsersRepository },
        { provide: PasswordResetService, useValue: {} },
        {
          provide: AuditService,
          useValue: {
            log: async () => undefined,
            logSafely: async () => undefined,
          },
        },
      ],
    }).compile()

    app = moduleFixture.createNestApplication()
    // Mirror the real bootstrap (api/src/main.ts) so DTO coercion behaves
    // exactly as it does in production — e.g. `streamId: "1"` in a JSON
    // body must satisfy `@IsInt()` after implicit conversion.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    )
    await app.init()

    jwtService = moduleFixture.get(JwtService)

    // Seed a user + token the same way a real client would: register, then
    // use the returned access token as the bearer credential for the
    // authenticated stream interactions below. Deliberately distinct from
    // `registerBody` (used by the `register` contract itself, below) so
    // that contract execution doesn't collide with a 409 "already exists".
    const seedRegisterRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        username: "streamsfixtureuser",
        email: "streams-fixture@example.com",
        password: "P4ssw0rd!",
      })
    userId = Number(seedRegisterRes.body.user.id)
    accessToken = jwtService.sign({ sub: userId })

    // Seed one stream so `get-stream-by-id` / `update-stream` have a real
    // id to substitute for the `EXISTING_STREAM_ID` placeholder.
    const stream = await streamsRepository.create({
      userId,
      name: "Seed stream",
      description: "Seeded for contract verification",
    })
    existingStreamId = String(stream.id)

    // Attach one tag so `list-stream-tags` exercises a non-empty
    // response (the schema pins the Tag shape, not just the empty case).
    const tagsRepository = moduleFixture.get(TagsRepository)
    const seededTag = await tagsRepository.upsertBySlug(
      "Live Streaming",
      "live-streaming",
    )
    await tagsRepository.attachToStream(stream.id, seededTag.id)

    // Seed one webhook subscription + a terminally failed delivery so the
    // update/delete/retry contracts have real ids. The subscription's
    // events deliberately exclude `stream:started` so the `update-stream`
    // contract (which dispatches that event) never fans out to it.
    const webhook = await subscriptionsRepository.create({
      userId,
      streamId: stream.id,
      url: "https://example.com/seed-hook",
      events: ["stream:stopped"],
      secret: "seed-secret",
    })
    existingWebhookId = String(webhook.id)

    const delivery = await deliveriesRepository.create(
      webhook.id,
      "stream:stopped",
      { streamId: stream.id },
    )
    delivery.status = "failed"
    delivery.attemptCount = 6
    delivery.nextAttemptAt = null
    delivery.lastError = "connection refused"
    existingDeliveryId = String(delivery.id)

    // Record one processed event so `list-stream-events` validates the
    // non-empty shape — most importantly the stringified id/streamId.
    await streamsRepository.recordEvent(stream.id, {
      eventType: "stream:started",
      payload: { streamId: stream.id },
      occurredAt: "2026-08-01T00:00:00.000Z",
    })

    // Seed one unread notification so `list-notifications` validates the
    // non-empty shape (numeric ids, ISO timestamps).
    await moduleFixture
      .get(NotificationsRepository)
      .create(userId, "stream:started", { streamId: stream.id })
  })

  afterAll(async () => {
    await app.close()
  })

  function resolveContractPath(contract: Contract): string {
    const pathParams = { ...contract.request.pathParams }
    for (const [key, value] of Object.entries(pathParams)) {
      if (value === PLACEHOLDER.EXISTING_STREAM_ID)
        pathParams[key] = existingStreamId
      if (value === PLACEHOLDER.MISSING_STREAM_ID) pathParams[key] = "999999"
      if (value === PLACEHOLDER.EXISTING_WEBHOOK_ID)
        pathParams[key] = existingWebhookId
      if (value === PLACEHOLDER.MISSING_WEBHOOK_ID) pathParams[key] = "999999"
      if (value === PLACEHOLDER.EXISTING_DELIVERY_ID)
        pathParams[key] = existingDeliveryId
    }
    return resolvePath({ ...contract.request, pathParams })
  }

  /** Recursively substitutes placeholders in body values (e.g. streamId). */
  function resolveBodyPlaceholders(value: unknown): unknown {
    if (typeof value === "string") {
      if (value === PLACEHOLDER.EXISTING_STREAM_ID) return existingStreamId
      if (value === PLACEHOLDER.MISSING_STREAM_ID) return "999999"
      if (value === PLACEHOLDER.EXISTING_WEBHOOK_ID) return existingWebhookId
      if (value === PLACEHOLDER.MISSING_WEBHOOK_ID) return "999999"
      if (value === PLACEHOLDER.EXISTING_DELIVERY_ID) return existingDeliveryId
      return value
    }
    if (Array.isArray(value)) return value.map(resolveBodyPlaceholders)
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(
          ([k, v]) => [k, resolveBodyPlaceholders(v)],
        ),
      )
    }
    return value
  }

  async function execute(contract: Contract) {
    const path = resolveContractPath(contract)
    let req = request(app.getHttpServer())[
      contract.request.method.toLowerCase() as "get"
    ](path)
    if (contract.request.authenticated) {
      req = req.set("Authorization", `Bearer ${accessToken}`)
    }
    if (contract.request.apiKey) {
      req = req.set("X-Stream-Api-Key", process.env.STREAM_API_KEY ?? "")
    }
    if (contract.request.body !== undefined) {
      req = req.send(resolveBodyPlaceholders(contract.request.body) as object)
    }
    return req
  }

  describe.each(streamsContracts)("$name", (contract) => {
    it(contract.description, async () => {
      const res = await execute(contract)

      expect(res.status).toBe(contract.response.status)
      const result = contract.response.schema.safeParse(res.body)
      if (!result.success) {
        throw new Error(
          `${contract.name}: response did not satisfy the contract schema\n` +
            `${JSON.stringify(result.error.format(), null, 2)}\n` +
            `body: ${JSON.stringify(res.body, null, 2)}`,
        )
      }
    })
  })

  describe.each(authContracts)("$name", (contract) => {
    it(contract.description, async () => {
      // `login` depends on `register` having already created the user in
      // `beforeAll`; both contracts share the same credentials fixture.
      const res = await execute(contract)

      expect(res.status).toBe(contract.response.status)
      const result = contract.response.schema.safeParse(res.body)
      if (!result.success) {
        throw new Error(
          `${contract.name}: response did not satisfy the contract schema\n` +
            `${JSON.stringify(result.error.format(), null, 2)}\n` +
            `body: ${JSON.stringify(res.body, null, 2)}`,
        )
      }
    })
  })

  describe.each(webhooksContracts)("$name", (contract) => {
    it(contract.description, async () => {
      const res = await execute(contract)

      expect(res.status).toBe(contract.response.status)
      const result = contract.response.schema.safeParse(res.body)
      if (!result.success) {
        throw new Error(
          `${contract.name}: response did not satisfy the contract schema\n` +
            `${JSON.stringify(result.error.format(), null, 2)}\n` +
            `body: ${JSON.stringify(res.body, null, 2)}`,
        )
      }
    })
  })

  describe.each(notificationsContracts)("$name", (contract) => {
    it(contract.description, async () => {
      const res = await execute(contract)

      expect(res.status).toBe(contract.response.status)
      const result = contract.response.schema.safeParse(res.body)
      if (!result.success) {
        throw new Error(
          `${contract.name}: response did not satisfy the contract schema\n` +
            `${JSON.stringify(result.error.format(), null, 2)}\n` +
            `body: ${JSON.stringify(res.body, null, 2)}`,
        )
      }
    })
  })

  it("login contract uses credentials the register contract actually created", () => {
    // Sanity check that the two contract fixtures stay in sync with each
    // other — if this ever fails, `auth.contract.ts` was edited so the
    // login body no longer matches the registered user.
    expect(loginBody.email).toBe(registerBody.email)
  })
})
