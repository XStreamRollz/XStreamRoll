# 7. OpenAPI-to-TypeScript Code Generation for the SDK

## Status

Accepted

## Context

The API (`api/`) exposes a full OpenAPI 3.0 specification via NestJS Swagger. The SDK (`xstreamroll-sdk/`) contains a hand-written `StreamingClient` with manually maintained TypeScript types in `src/types.ts`. Every API change requires a corresponding manual update to the SDK, which inevitably drifts over time.

Several approaches exist to bridge this gap:

- **openapi-generator-cli** (Java-based) generates a full API client from any OpenAPI spec. It is powerful but heavy, slow, and produces verbose output that is hard to customise.
- **openapi-typescript** (TypeScript-native) generates TypeScript type declarations (`.d.ts`) from an OpenAPI spec. It is fast, lightweight, and focuses solely on types, leaving the hand-written client in place.

## Decision

We will use **openapi-typescript** to generate TypeScript types from the OpenAPI spec, then import those generated types into the hand-written `StreamingClient`.

Key details of the implementation:

1. **Tool**: `openapi-typescript` v7 (npm package) installed as a dev dependency in the SDK workspace.
2. **Generated output**: `xstreamroll-sdk/src/generated/schema.d.ts` — committed to the repository so the SDK is always buildable without a running API.
3. **Generation script**: `xstreamroll-sdk/scripts/generate-types.sh` extracts the OpenAPI spec (via a running API endpoint or programmatically from the compiled NestJS app) and feeds it to `openapi-typescript`.
4. **NPM scripts**:
   - `npm run generate:types --workspace=xstreamroll-sdk` — regenerates the types.
   - `npm run generate:sdk` (root) — builds the API, then regenerates the types.
   - `npm run generate:sdk:check` (root) — regenerates and fails if the generated file differs from what is committed (spec drift detection).
5. **Usage in code**: `types.ts` re-exports generated schema types (e.g. `RegisterDto`, `LoginDto`, `CreateStreamDto`) alongside hand-written SDK types that have no OpenAPI equivalent (e.g. `StreamConfig`, `ApiError`, `AuthTokens`).

## Consequences

- **No spec drift**: Developers regenerate types after API changes. The CI's existing `npx tsc --noEmit` steps on both the API and SDK catch any type mismatches.
- **Faster iteration**: Adding a new API endpoint and DTO requires only regenerating types — no manual type writing in the SDK.
- **Backward compatibility**: Existing SDK consumers keep the same API; only the type source changes internally.
- **Build dependency**: Regenerating types requires either a running API or a compiled API dist with a database connection. The committed generated file avoids this for day-to-day development.
- **CI validation**: `npm run generate:sdk:check` can be run in CI when a PostgreSQL service is available to detect unintended spec drift. Without a database, the existing type-check steps provide partial validation.
