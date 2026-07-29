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
  streamSchema,
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
})
