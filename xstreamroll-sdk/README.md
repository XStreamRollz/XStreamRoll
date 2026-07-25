# @stellar/streaming-sdk

A lightweight, isomorphic TypeScript client for the XStreamRoll platform. It
handles authentication, stream CRUD, real-time event publishing, and an
extensible HTTP transport (interceptors + retry) — with no runtime
dependencies on Node-only APIs.

> The package is published as `@stellar/streaming-sdk`. See the [Publishing
> section](#publishing) for release instructions.

---

## Table of contents

1. [Installation](#installation)
2. [Quick start](#quick-start)
3. [Configuration](#configuration)
4. [Authentication](#authentication)
5. [Streams](#streams)
6. [Real-time events](#real-time-events)
7. [HTTP transport](#http-transport)
   * [Interceptors](#interceptors)
   * [Retries](#retries)
   * [Error model](#error-model)
8. [Pagination](#pagination)
9. [Types](#types)
10. [Browser usage](#browser-usage)
11. [Testing helpers](#testing-helpers)
12. [Versioning & compatibility](#versioning--compatibility)
13. [Publishing](#publishing)

---

## Installation

```bash
# npm
npm install @stellar/streaming-sdk

# pnpm
pnpm add @stellar/streaming-sdk

# yarn
yarn add @stellar/streaming-sdk
```

The SDK targets ES2020 and has zero runtime dependencies beyond
`axios` (the `client.ts` convenience class) and the browser/node built-in
`fetch` (the `http.ts` interceptor-aware client). `ts-jest` and `jest`
are the only dev dependencies needed to run the test suite.

---

## Quick start

```ts
import { StreamingClient, ApiError } from "@stellar/streaming-sdk"

const client = new StreamingClient({
  env: "production", // or "staging" | "development", or a custom baseUrl
})

// 1. Log in
const { accessToken, refreshToken } = await client.login(
  "alice@example.com",
  "super-secret-password"
)

// 2. Create a stream
// (auth tokens are attached automatically after login)

// 3. Publish an event
try {
  await client.publishEvent({
    streamId: "stream_abc",
    eventType: "viewer:joined",
    data: { viewerId: "user_42" },
  })
} catch (err) {
  if (err instanceof ApiError) {
    console.error(`API ${err.statusCode}: ${err.message}`)
  } else {
    throw err
  }
}

// 4. Tear down
await client.logout()
```

---

## Configuration

`StreamingClient` accepts a `StreamConfig`:

| Field      | Type                                            | Notes                                                            |
| ---------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `env`      | `"development" \| "staging" \| "production"`   | Named preset. Resolves to a well-known base URL.                 |
| `baseUrl`  | `string`                                        | Explicit base URL. Overrides `env` and the legacy `apiUrl`.      |
| `apiUrl`   | `string` (deprecated)                           | Legacy field. Kept for backwards compatibility.                  |
| `clientId` | `string`                                        | Identifier attached to published events. Defaults to a timestamp. |

Resolution order: `baseUrl` → `env` → `apiUrl` → `development`.

The full URL presets are:

| Env           | Base URL                          |
| ------------- | --------------------------------- |
| `development` | `http://localhost:3001`            |
| `staging`     | `https://staging-api.xstreamroll.io` |
| `production`  | `https://api.xstreamroll.io`      |

---

## Authentication

```ts
const tokens = await client.login(email, password)
const tokens = await client.register({
  email: "alice@example.com",
  password: "super-secret-password",
  displayName: "Alice",
})
```

`StreamingClient` keeps the active tokens on the instance and:

* attaches `Authorization: Bearer <accessToken>` to every outbound
  request, and
* transparently refreshes the access token on a `401` response (using
  the stored refresh token), then retries the original request once.

Call `await client.logout()` to invalidate the session server-side and
drop the local tokens.

> Token storage: the SDK keeps tokens in memory only. In browser
> environments, refresh tokens are exchanged via httpOnly cookies set
> by the server — never store JWTs in `localStorage` or
> `sessionStorage`, as they are readable by any JavaScript on the page
> and trivially exfiltrated in an XSS attack (OWASP A07:2021).

---

## Streams

The SDK exposes the high-level stream operations on `StreamingClient`.
A lower-level `HttpClient` is also exported for callers that need raw
HTTP access (see [HTTP transport](#http-transport)).

```ts
// get stream status (returns the API payload as-is)
const status = await client.getStreamStatus("stream_abc")
```

> Stream CRUD endpoints are wired in `api/` and consumed by the web
> app. The SDK is intentionally thin so it can mirror the API surface
> 1:1; for new endpoints prefer adding a small method on the client
> rather than reaching into `HttpClient` from app code.

---

## Real-time events

```ts
await client.publishEvent({
  streamId: "stream_abc",
  eventType: "data",
  data: { foo: "bar" },
})
```

`eventType` is one of the union members exported as `StreamEventType`:
`"stream:started" | "stream:stopped" | "stream:error" |
"viewer:joined" | "viewer:left" | "data"`. The client auto-fills
`clientId` and a `timestamp` (ISO 8601) before posting.

> WebSocket subscription is in the roadmap but is not yet exposed in
> this version; track issue #34 for progress.

---

## HTTP transport

`HttpClient` is a small, `fetch`-based wrapper that:

* merges `baseUrl` + `path`,
* runs request/response interceptors in registration order,
* retries transient failures (5xx, 408, 425, 429) with exponential
  backoff + jitter.

```ts
import { HttpClient } from "@stellar/streaming-sdk"

const http = new HttpClient("https://api.xstreamroll.io", {
  maxAttempts: 5,
  baseDelayMs: 250,
  maxDelayMs: 5_000,
})

const res = await http.request("/streams/abc")
const json = await res.json()
```

### Interceptors

```ts
const authHandle = http.addRequestInterceptor((cfg) => ({
  ...cfg,
  headers: { ...cfg.headers, Authorization: `Bearer ${token}` },
}))

const metricsHandle = http.addResponseInterceptor((res) => {
  metrics.record(`/ -> ${res.status}`)
  return res
})

// later
http.removeInterceptor(authHandle)
http.removeInterceptor(metricsHandle)
```

Request interceptors run in registration order, receive the full
`RequestInit & { url }`, and may return a new config. Response
interceptors run after `fetch` resolves, may be async, and may replace
the response (e.g. to transparently re-issue on 401).

### Retries

The retry helper (`withRetry`) is generic and exported separately:

```ts
import { withRetry } from "@stellar/streaming-sdk"

await withRetry(() => callFlakyApi(), {
  maxAttempts: 4,
  baseDelayMs: 100,
  maxDelayMs: 2_000,
  jitterMs: 50,
  onRetry: (err, attempt, delay) => console.warn("retry", attempt, err, delay),
})
```

The `HttpClient` uses the helper internally; pass `{ enabled: false }`
to opt out per client.

### Error model

When the retry budget is exhausted the client throws
`HttpRequestError`, which carries:

* the last error message,
* the last `Response` (cloned, so it can be read after the throw),
* the number of attempts made.

The high-level `StreamingClient` translates non-2xx responses into
`ApiError` (also exported from the SDK), exposing `statusCode`,
`message`, and a typed `response` payload.

---

## Pagination

List endpoints return a `PaginatedResponse<T>`:

```ts
interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}
```

`PaginationParams` lets you pass `{ page, limit }`; the API enforces a
max page size of 100.

---

## Types

The SDK ships full type definitions. The most useful are:

* `Stream`, `CreateStreamDto`, `UpdateStreamDto` — stream CRUD shapes.
* `StreamEvent`, `StreamEventRecord`, `StreamEventType` — event shapes.
* `AuthTokens`, `User`, `CreateUserDto`, `UpdateUserDto` — auth shapes.
* `PaginatedResponse<T>`, `PaginationParams` — list helpers.
* `ApiError`, `ApiErrorResponse`, `ValidationError` — error shapes.

All types are re-exported from the package root.

---

## Browser usage

The SDK works in the browser out of the box. `HttpClient` uses the
built-in `fetch`; `StreamingClient` uses `axios`, which the SDK
bundles. No polyfills are required for evergreen browsers.

For SSR environments (Next.js, Remix, etc.) avoid constructing the
client at module scope; lazy-construct it inside the request handler so
that auth tokens can be read from the incoming request.

---

## Testing helpers

The retry behaviour and the HTTP layer are both fully unit-tested. To
test consumers, the recommended approach is to inject a mock
`HttpClient` rather than the full `StreamingClient`:

```ts
import { HttpClient } from "@stellar/streaming-sdk"

const mock = new HttpClient("http://test")
// add request/response interceptors to assert on outbound calls
```

For retry timing in tests, inject a custom `sleep`:

```ts
new HttpClient("http://x", { sleep: async () => {} })
```

---

## Versioning & compatibility

* Follows [semver](https://semver.org/).
* Public API is whatever the package `index.ts` re-exports.
* Breaking changes bump the major version and are announced in the
  release notes.

The package currently declares `axios` as a dependency for the
high-level `StreamingClient`; the `HttpClient` + `withRetry` surface
is dependency-free and safe to use in size-sensitive environments.

---

## Publishing

Publishing is done by the maintainers via the `release.yml` workflow
(`.github/workflows/release.yml`). To cut a release:

1. Bump the version in `xstreamroll-sdk/package.json` (semver).
2. Update the changelog.
3. Open a PR titled `chore(sdk): release vX.Y.Z`.
4. Once merged and CI is green, push the matching tag:
   `git tag sdk/vX.Y.Z && git push origin sdk/vX.Y.Z`.

The release workflow builds the package and publishes it to the
configured registry.
