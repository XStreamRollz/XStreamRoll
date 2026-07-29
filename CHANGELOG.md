# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Trivy vulnerability scanning for Docker images (`api`, `app`, `processing`) in CI; scans run on Dockerfile changes and weekly against published `ghcr.io` images, with SARIF reports uploaded to GitHub Code Scanning and the workflow failing on `CRITICAL` findings. Closes #372.
- Dependabot configuration in `.github/dependabot.yml` covering all five `package.json` locations (root, `api`, `app`, `xstreamroll-sdk`, `xstreamroll-processing`), with grouped updates (`@nestjs/*`, `@opentelemetry/*`, React/Next, `@radix-ui/*`), weekly schedules, and auto-merge for patch and security updates via `.github/workflows/dependabot-auto-merge.yml`. Closes #368.
- `.trivyignore` file at the repo root documenting the suppression format and serving as the canonical place for triaged false-positive findings.
- `@xstreamroll/contract-tests` workspace package (`tests/contracts`) with a custom consumer/provider contract test suite covering the `streams` and `auth` endpoints: `api/src/contract-provider.spec.ts` verifies the API satisfies each contract, `xstreamroll-sdk/__tests__/contract.consumer.test.ts` verifies the SDK sends/parses what each contract describes. CI fails if either suite fails (`#399`).
- `@xstreamroll/types` workspace package (`packages/types`) as the single source of truth for domain types (`User`, `Stream`, `StreamEvent`, pagination, and API error shapes) shared by `api`, `app`, and `xstreamroll-sdk` (`#376`).
- Kubernetes deployment manifests for API, App, Processing Worker, and PostgreSQL (`#217`).
- Health check endpoints (`/api/health`, `/livez`, `/healthz`) to support container orchestrator probes.
- `SECURITY.md` policy covering supported versions, SLAs, and private vulnerability reporting.
- Comprehensive `CONTRIBUTING.md` guide covering monorepo setup, conventional commits, and PR expectations.
- PostgreSQL-backed `TagsDbRepository` and `StreamsDbRepository` for secure, parameterized data access.
- User registration page (`/auth/register`) in the Next.js frontend with Zod schema validation.
- **Stream visibility (`#393`):** additive `visibility: "public" | "private"` field on `Stream`, with `"private"` as the safe default. New `visibility` query filter on `GET /streams`, opt-in `visibility` on create/update payloads, and migration `2026080101_add_streams_visibility.up.sql` to backfill existing rows.
- **Stream event replay API (`#396`):** new `GET /streams/:id/events` endpoint returning paginated historical events for a stream, backed by a new `StreamEvents` refactored into the existing repository pattern so swapping the in-memory store for a Postgres-backed one is a drop-in.
- **SDK streaming pagination helper (`#390`):** `paginateAll()` async iterator on `StreamingClient` walks every page of a paginated list endpoint without forcing callers to re-implement cursor logic. Computes `hasMore` from `total / page / limit` so the on-wire `PaginatedResponse<T>` type stays unchanged.
- **Browser-compatible SDK build (`#387`):** the SDK now ships a dual CJS + ESM build (`dist/` and `dist-esm/`), with a `module`, `browser`, and `exports` field on `xstreamroll-sdk/package.json`. Bundler entry points (`Vite`, `Webpack`, `Rollup`, `esbuild`) pick the ESM bundle automatically.
- **Pre-commit and pre-push hooks (`#385`):** `husky` and `lint-staged` are wired (`npm run prepare` installs the hooks) so staged TS/JS files get `eslint --max-warnings=0` + `prettier --write`; pre-push runs the package-wide `tsc --noEmit` suite in parallel for the api, sdk, and processing workspaces.
- **Mutation testing scaffold (`#389`):** a `stryker.config.json` for the SDK plus an `npm run test:mutation` script that runs Stryker against the SDK retry / HttpClient / webhook signature surfaces. Opt-in (not in default CI) so existing CI workflows stay green until the team is ready to expand coverage.
- **ADR-0008 evaluating a message-queue replacement (`#404`):** documents the candidate architectures, recommendation (Redis Streams), and phased migration path with explicit exit criteria.
- **PostgresLockManager coverage expansion (`#401`):** added four edge-case tests in `xstreamroll-processing/__tests__/leader-election.test.ts` so the SQL-contract branches the existing in-memory suite could not exercise are now covered: (1) `renew` returns false when the same row has been taken over by a different `worker_id`; (2) `release` is a no-op for a stream that was never claimed; (3) `releaseAll` binds the current `worker_id` (not a wildcard); (4) `acquire` returns null when the DB hands back a row owned by a foreign worker.

### Changed

- **Breaking (api):** `Stream` and `User` `id`/`userId` fields are now serialized as strings in JSON responses instead of numbers, resolving the `Stream.id: number` (API) vs. `Stream.id: string` (SDK) contract mismatch. Internal storage (Postgres `SERIAL` columns) and request-side route params are unaffected — the change is at the response boundary only.
- **Breaking (xstreamroll-sdk):** `User`, `Stream`, `CreateStreamDto`, `UpdateStreamDto`, `StreamEvent`, `StreamEventRecord`, and the pagination/error types are now re-exported from `@xstreamroll/types` instead of being defined locally, and no longer include fields the API never actually implemented (`User.role`, `User.displayName`, `Stream.visibility`). `CreateUserDto` now matches the real `POST /auth/register` contract (`username` instead of `displayName`) — previously any `register()` call would fail server-side validation.
- `app`'s server-side stream cache (`lib/cache/streams.ts`) now uses the shared `Stream` / `PaginatedResponse` types instead of a locally-defined `StreamSummary` / `StreamListResult` whose field names (`items`) had drifted from the real API response shape (`data`).
- `StreamOwnershipService` in API backend now safely queries the PostgreSQL database via parameterized queries instead of relying on demo environment variables.
- Prepared `AdminStatsService` for database integration to aggregate platform-wide stats.
- **Breaking (xstreamroll-sdk):** `StreamingClient` now uses the fetch-based `HttpClient` (with shared `withRetry`) instead of axios. The `axios` dependency has been removed from `@stellar/streaming-sdk`. Callers that relied on axios-specific error shapes (`AxiosError`, `error.isAxiosError`, axios interceptors on the client instance) must switch to `ApiError` / `HttpRequestError`. The public `StreamingClient` method surface is unchanged.
- ADR-0003 (`docs/adr/0003-polling-based-processing.md`) is enriched with an explicit recovery model, signals to revisit the decision, and a forward link to ADR-0008 (`#391`).
- ESLint configuration now enforces consistent import ordering via `eslint-plugin-import`'s `import/order` rule (groups: builtin / external / internal / parent / sibling / index) — autofix with `npm run lint:fix`. The `lint` script no longer fails on warnings so a gradual rollout is safe across the existing codebase (`#403`).

### Fixed

- UI `ConfirmDialog` component now properly handles async states and prevents dialog dismissal while action promises are pending.
- `xstreamroll-sdk` README replaces the obsolete `axios` wording with the current `fetch`-based HTTP transport, removes the "track issue #34" placeholder for the upcoming WebSocket support, and corrects two stale status URLs (`#395`).

### Security
- Scheduled re-scan of published `ghcr.io/<owner>/xstreamroll-{api,app,processing}:latest` images so newly disclosed CVEs are surfaced outside of release windows. (#372)
