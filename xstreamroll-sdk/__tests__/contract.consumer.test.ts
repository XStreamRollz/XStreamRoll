/**
 * Consumer contract verification for tests/contracts/.
 *
 * For each endpoint the SDK actually calls, this asserts two things
 * against the shared contract in `@xstreamroll/contract-tests`:
 *
 *   1. The SDK sends a request matching what the API contract expects
 *      (method, path, body) — this is where a change like the
 *      `CreateUserDto.displayName` → `username` fix would have shown up
 *      immediately as a failing nock match, instead of a silent 400 at
 *      runtime.
 *   2. Given a response that satisfies the contract's schema, the SDK
 *      resolves it without throwing or mangling the shape.
 *
 * `getStreamStatus` maps to `get-stream-by-id`. `register`/`login` map to
 * `register`/`login`. The SDK doesn't implement create/list/update-stream
 * yet, so those contracts are provider-only for now (see
 * `api/src/contract-provider.spec.ts`).
 */
import {
  allContracts,
  authResponseSchema,
  paginatedWebhookSubscriptionsSchema,
  pendingStreamEventSchema,
  streamSchema,
  webhookDeliverySchema,
  webhookSubscriptionSchema,
  webhookSubscriptionSummarySchema,
  type Contract,
} from "@xstreamroll/contract-tests"
import nock from "nock"

import { StreamingClient } from "../src/client"

const BASE_URL = "http://api.test"

function contract(name: string): Contract {
  const found = allContracts.find((c) => c.name === name)
  if (!found) throw new Error(`no contract named "${name}" — check tests/contracts/src`)
  return found
}

describe("Consumer contract verification (xstreamroll-sdk)", () => {
  let client: StreamingClient

  beforeEach(() => {
    client = new StreamingClient({ baseUrl: BASE_URL })
    if (!nock.isActive()) nock.activate()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.restore()
  })

  it("getStreamStatus() requests exactly what get-stream-by-id expects and returns a contract-valid Stream", async () => {
    const c = contract("get-stream-by-id")
    const example = {
      id: "42",
      userId: "7",
      name: "Contract stream",
      description: null,
      status: "active",
      visibility: "private",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    // The example itself must be valid per the shared schema, or this
    // test would be asserting nothing meaningful.
    expect(() => streamSchema.parse(example)).not.toThrow()

    const scope = nock(BASE_URL).get("/streams/42").reply(c.response.status, example)

    const result = await client.getStreamStatus("42")

    expect(scope.isDone()).toBe(true)
    expect(() => streamSchema.parse(result)).not.toThrow()
    expect(result).toEqual(example)
  })

  it("publishEvent() hits POST /streams/events with the api key and a contract-valid response (issue #514)", async () => {
    const c = contract("ingest-stream-event")
    const apiKey = "sk-test-123"
    const keyedClient = new StreamingClient({ baseUrl: BASE_URL, apiKey })

    const example = {
      streamId: "42",
      data: { viewerId: "user_42" },
      timestamp: "2026-01-01T00:00:00.000Z",
    }
    expect(() => pendingStreamEventSchema.parse(example)).not.toThrow()

    const scope = nock(BASE_URL)
      .post("/streams/events", {
        streamId: "42",
        data: { viewerId: "user_42" },
      })
      .matchHeader("X-Stream-Api-Key", apiKey)
      .reply(c.response.status, example)

    await keyedClient.publishEvent({
      streamId: "42",
      eventType: "viewer:joined",
      data: { viewerId: "user_42" },
    })

    expect(scope.isDone()).toBe(true)
  })

  it("register() sends the request body the register contract expects", async () => {
    const c = contract("register")
    const example = {
      user: {
        id: "1",
        username: "contractuser",
        email: "contract-user@example.com",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      accessToken: "signed.jwt.token",
      refreshToken: "signed.refresh.token",
    }
    expect(() => authResponseSchema.parse(example)).not.toThrow()

    const scope = nock(BASE_URL)
      .post(c.request.path, c.request.body as nock.DataMatcherMap)
      .reply(c.response.status, example)

    const result = await client.register(c.request.body as Parameters<typeof client.register>[0])

    expect(scope.isDone()).toBe(true)
    // `StreamingClient.register()` is typed to return `AuthTokens`
    // (accessToken/refreshToken/expiresIn); the real API's `AuthResponse`
    // now also returns `accessToken`/`refreshToken` (see main's "Jwt
    // persistence" work), so both agree on those two fields. `expiresIn`
    // is still API-side-absent — asserting it here would encode a gap
    // that isn't actually closed yet.
    expect(result.accessToken).toBe(example.accessToken)
    expect(result.refreshToken).toBe(example.refreshToken)
  })

  it("login() sends the request body the login contract expects", async () => {
    const c = contract("login")
    const example = {
      user: {
        id: "1",
        username: "contractuser",
        email: "contract-user@example.com",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      accessToken: "signed.jwt.token",
      refreshToken: "signed.refresh.token",
    }
    expect(() => authResponseSchema.parse(example)).not.toThrow()

    const { email, password } = c.request.body as { email: string; password: string }
    const scope = nock(BASE_URL).post(c.request.path, c.request.body as nock.DataMatcherMap).reply(c.response.status, example)

    const result = await client.login(email, password)

    expect(scope.isDone()).toBe(true)
    expect(result.accessToken).toBe(example.accessToken)
    expect(result.refreshToken).toBe(example.refreshToken)
  })

  // ── Webhooks (issue #531) ────────────────────────────────────────────────

  it("subscribeWebhook() sends the body the create-webhook contract expects", async () => {
    const c = contract("create-webhook")
    const example = {
      id: "1",
      userId: "7",
      streamId: "42",
      url: "https://example.com/webhooks/contract",
      events: ["stream:started"],
      secret: "a1b2c3",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    }
    expect(() => webhookSubscriptionSchema.parse(example)).not.toThrow()

    const scope = nock(BASE_URL)
      .post(c.request.path, c.request.body as nock.DataMatcherMap)
      .reply(c.response.status, example)

    const result = await client.subscribeWebhook(
      c.request.body as Parameters<typeof client.subscribeWebhook>[0],
    )

    expect(scope.isDone()).toBe(true)
    expect(result).toEqual(example)
  })

  it("listWebhooks() requests the list-webhooks path and returns a contract-valid page", async () => {
    const c = contract("list-webhooks")
    const example = {
      data: [
        {
          id: "1",
          userId: "7",
          streamId: "42",
          url: "https://example.com/hook",
          events: ["stream:started"],
          active: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    }
    expect(() => paginatedWebhookSubscriptionsSchema.parse(example)).not.toThrow()

    const scope = nock(BASE_URL)
      .get("/webhooks?page=1&limit=20")
      .reply(c.response.status, example)

    const result = await client.listWebhooks({ page: 1, limit: 20 })

    expect(scope.isDone()).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).not.toHaveProperty("secret")
  })

  it("updateWebhook() PATCHes the update-webhook path and returns a summary", async () => {
    const c = contract("update-webhook")
    const example = {
      id: "1",
      userId: "7",
      streamId: "42",
      url: "https://example.com/hook",
      events: ["stream:started"],
      active: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    }
    expect(() => webhookSubscriptionSummarySchema.parse(example)).not.toThrow()

    const scope = nock(BASE_URL)
      .patch("/webhooks/1", { active: false } as nock.DataMatcherMap)
      .reply(c.response.status, example)

    const result = await client.updateWebhook("1", { active: false })

    expect(scope.isDone()).toBe(true)
    expect(result.active).toBe(false)
    expect(result).not.toHaveProperty("secret")
  })

  it("deleteWebhook() DELETEs the delete-webhook path and resolves on 204", async () => {
    const c = contract("delete-webhook")
    const scope = nock(BASE_URL).delete("/webhooks/1").reply(204)

    await expect(client.deleteWebhook("1")).resolves.toBeUndefined()

    expect(scope.isDone()).toBe(true)
    expect(c.response.status).toBe(204)
  })

  it("retryWebhookDelivery() POSTs the retry path and returns a contract-valid delivery", async () => {
    const c = contract("retry-webhook-delivery")
    const example = {
      id: "10",
      webhookSubscriptionId: "1",
      event: "stream:started",
      payload: { streamId: 42 },
      status: "pending",
      attemptCount: 6,
      lastStatusCode: null,
      lastResponseBody: null,
      lastError: "connection refused",
      nextAttemptAt: "2026-01-01T00:05:00.000Z",
      deliveredAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    }
    expect(() => webhookDeliverySchema.parse(example)).not.toThrow()

    const scope = nock(BASE_URL)
      .post("/webhooks/1/deliveries/10/retry")
      .reply(c.response.status, example)

    const result = await client.retryWebhookDelivery("1", "10")

    expect(scope.isDone()).toBe(true)
    expect(result.status).toBe("pending")
  })
})
