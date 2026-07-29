# @xstreamroll/contract-tests

Consumer/provider contract tests between `xstreamroll-sdk` (consumer) and
`api` (provider), replacing the informal assumption that "the SDK's types
match what the API returns" with something CI actually checks.

## Why a custom suite instead of Pact

Pact needs a broker (or a file-based pact exchange) and provider-state
setup on top of what this repo already has. A custom suite built on the
existing stack — Jest, `supertest` (already a root devDependency),
[zod](https://github.com/colinhacks/zod) (already used across `api` and
`app`) — gets the same guarantee with less new infrastructure:

- **Consumer contract**: for each endpoint the SDK calls, a `Contract`
  object in `src/*.contract.ts` describes the request shape the SDK
  sends and a zod schema for the response it expects.
- **Provider verification**: [`api/src/contract-provider.spec.ts`](../../api/src/contract-provider.spec.ts)
  boots the real controllers and services (in-memory repositories instead
  of Postgres — no DB required) and asserts the actual HTTP response
  matches each contract's schema.
- **Consumer verification**: [`xstreamroll-sdk/__tests__/contract.consumer.test.ts`](../../xstreamroll-sdk/__tests__/contract.consumer.test.ts)
  asserts the SDK sends the request the contract describes, and correctly
  parses a schema-valid response.

Both suites import the *same* `Contract` objects from this package, so
they can't independently drift the way the plain TS interfaces this
replaced could (see the root `@xstreamroll/types` package's history for
exactly that kind of drift: `Stream.id` was `number` in the API and
`string` in the SDK for a long time before anyone noticed).

## How the schemas stay honest

Every zod schema in `src/schemas.ts` is pinned to a `@xstreamroll/types`
interface at compile time via a small `typed<T>()` helper:

```ts
export const streamSchema = typed<Stream>()(
  z.object({ id: z.string(), /* ... */ }),
)
```

If `Stream` changes shape and this schema isn't updated to match, the
package fails to build — before any test even runs.

## Updating a contract

When an endpoint's request or response shape changes:

1. Update the type in `packages/types` if the change affects the shared
   domain shape.
2. Update the corresponding schema in `src/schemas.ts` and/or the
   `Contract` entry in `src/streams.contract.ts` / `src/auth.contract.ts`.
3. Run `npm run build` in this package, then the `api` and
   `xstreamroll-sdk` test suites. A real contract break shows up as a
   provider-verification failure (api) and/or a consumer failure (sdk) —
   both fail CI.

## What's covered

| Contract                     | Provider (api) | Consumer (sdk) |
| ----------------------------- | :-------------: | :--------------: |
| `create-stream`                | ✅               | —¹               |
| `list-streams`                 | ✅               | —¹               |
| `get-stream-by-id`             | ✅               | ✅               |
| `get-stream-by-id-not-found`   | ✅               | —¹               |
| `update-stream`                | ✅               | —¹               |
| `register`                     | ✅               | ✅               |
| `login`                        | ✅               | ✅               |

¹ The SDK doesn't implement a client method for this endpoint yet, so
there's nothing to consumer-verify. The provider contract still exists
so the API's behavior is pinned down for whenever the SDK adds one.
