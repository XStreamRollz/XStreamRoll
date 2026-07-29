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
   * [Walking every page (`paginateAll`)](#walking-every-page-paginateall)
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

The SDK targets ES2020 and has **no runtime dependencies** — both
`client.ts` and `http.ts` are built on the standard `fetch` API and the
browser/node-built-in `crypto.subtle` (used for webhook signature
verification). `ts-jest` and `jest` are the only dev dependencies needed
to run the test suite. Bundlers (`webpack`, `Rollup`, `esbuild`, `Vite`)
pick the ESM build via the `exports` field in `package.json`; the CJS
build is kept for Node `require()` consumers.

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
  "super-secret-password",
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

| Env           | Base URL                              |
| ------------- | ------------------------------------- |
| `development` | `http://localhost:3001`               |
| `staging`     | `https://staging-api.xstreamroll.io`  |
| `production`  | `https://api.xstreamroll.io`          |

> The presets above are the **defaults** baked into the SDK at build
> time. If you self-host the API, pass an explicit `baseUrl` rather
> than relying on a preset — see [Browser usage](#browser-usage) for an
> example.

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

> The SDK supports HTTP event publishing today. Server-sent
> WebSocket fan-out for the `app/` dashboard is on the immediate
> roadmap and will be exposed as a new transport-laundering
> helper on the client; this README intentionally does not link
> an issue number for that work because the implementation choice
> is still being finalized.

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

### Walking every page (`paginateAll`)

List endpoints often require callers to drive the cursor by hand —
re-computing `page`, incrementing until `total` is collected. The SDK
exposes a small async iterator helper that does that loop for you and
yields each item exactly once across the entire result set:

```ts
import { StreamingClient } from "@stellar/streaming-sdk"

const client = new StreamingClient({ env: "production" })

// Iterate every public stream, page by page, as an async iterable.
for await (const stream of client.paginateAll<Stream>("/streams", {
  visibility: "public",
  limit: 100,
})) {
  console.log("got stream", stream.id)
}

// Or collect the full list synchronously once the iterator drained.
const allStreams = await client.paginateAll("/streams").toArray()
```

`paginateAll` exposes an async iterator (use `for await … of`) and the
standard `AsyncIterable` helpers — `.toArray()`, `.map(fn)`,
`.filter(fn)`. It stops when the `page * limit` envelope reaches
`total`, so it works even if the server omits the (legacy) `hasMore`
flag from the response.

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

The SDK ships both a **CJS** build (`dist/index.js`) and an **ESM**
build (`dist-esm/index.js`) and exposes them through the standard
`"exports"` field in `package.json`. Tree-shaking bundlers (`Vite`,
`Webpack 5+`, `Rollup`, `esbuild`, `Turbopack`) automatically pick the
ESM bundle; older bundlers and Node `require()` resolve to the CJS
build. No polyfills are required for evergreen browsers — the SDK
uses the native `fetch` and `crypto.subtle` APIs that have shipped in
every evergreen browser for several years.

```ts
import { StreamingClient } from "@stellar/streaming-sdk"

const client = new StreamingClient({
  baseUrl: "https://api.my-deployment.example.com",
})
```

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

For mutation testing — to detect undertested code paths masked by
high line coverage — the SDK ships a Stryker config:

```bash
npm run test:mutation --workspace=xstreamroll-sdk
```

---

## Versioning & compatibility

* Follows [semver](https://semver.org/).
* Public API is whatever the package `index.ts` re-exports.
* Breaking changes bump the major version and are announced in the
  release notes.

> The package has **no runtime dependencies**. Everything in the public
> surface (`StreamingClient`, `HttpClient`, `withRetry`, `paginateAll`,
> `verifyWebhookSignature`, types) is built on the standard `fetch`
> and `crypto.subtle` APIs, so the SDK is safe to use in
> size-sensitive environments.

---

## Publishing

Publishing is done by the maintainers via the `release.yml` workflow
(`.github/workflows/release.yml`). To cut a release:

1. Bump the version in `xstreamroll-sdk/package.json` (semver).
2. Update the changelog.
3. Open a PR titled `chore(sdk): release vX.Y.Z`.
4. Once merged and CI is green, push the matching tag:
   `git tag sdk/vX.Y.Z && git push origin sdk/vX.Y.Z`.

The release workflow builds the package (CJS + ESM) and publishes it
to the configured registry.
