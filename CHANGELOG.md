# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `@xstreamroll/types` workspace package (`packages/types`) as the single source of truth for domain types (`User`, `Stream`, `StreamEvent`, pagination, and API error shapes) shared by `api`, `app`, and `xstreamroll-sdk` (`#376`).
- Kubernetes deployment manifests for API, App, Processing Worker, and PostgreSQL (`#217`).
- Health check endpoints (`/api/health`, `/livez`, `/healthz`) to support container orchestrator probes.
- `SECURITY.md` policy covering supported versions, SLAs, and private vulnerability reporting.
- Comprehensive `CONTRIBUTING.md` guide covering monorepo setup, conventional commits, and PR expectations.
- PostgreSQL-backed `TagsDbRepository` and `StreamsDbRepository` for secure, parameterized data access.
- User registration page (`/auth/register`) in the Next.js frontend with Zod schema validation.

### Changed

- **Breaking (api):** `Stream` and `User` `id`/`userId` fields are now serialized as strings in JSON responses instead of numbers, resolving the `Stream.id: number` (API) vs. `Stream.id: string` (SDK) contract mismatch. Internal storage (Postgres `SERIAL` columns) and request-side route params are unaffected — the change is at the response boundary only.
- **Breaking (xstreamroll-sdk):** `User`, `Stream`, `CreateStreamDto`, `UpdateStreamDto`, `StreamEvent`, `StreamEventRecord`, and the pagination/error types are now re-exported from `@xstreamroll/types` instead of being defined locally, and no longer include fields the API never actually implemented (`User.role`, `User.displayName`, `Stream.visibility`). `CreateUserDto` now matches the real `POST /auth/register` contract (`username` instead of `displayName`) — previously any `register()` call would fail server-side validation.
- `app`'s server-side stream cache (`lib/cache/streams.ts`) now uses the shared `Stream` / `PaginatedResponse` types instead of a locally-defined `StreamSummary` / `StreamListResult` whose field names (`items`) had drifted from the real API response shape (`data`).
- `StreamOwnershipService` in API backend now safely queries the PostgreSQL database via parameterized queries instead of relying on demo environment variables.
- Prepared `AdminStatsService` for database integration to aggregate platform-wide stats.
- **Breaking (xstreamroll-sdk):** `StreamingClient` now uses the fetch-based `HttpClient` (with shared `withRetry`) instead of axios. The `axios` dependency has been removed from `@stellar/streaming-sdk`. Callers that relied on axios-specific error shapes (`AxiosError`, `error.isAxiosError`, axios interceptors on the client instance) must switch to `ApiError` / `HttpRequestError`. The public `StreamingClient` method surface is unchanged.

### Fixed

- UI `ConfirmDialog` component now properly handles async states and prevents dialog dismissal while action promises are pending.

## [1.0.0] - 2024-05-24

### Added

- Initial release of the XStreamRoll platform.
- `app`: Next.js 16 user-facing web frontend.
- `api`: NestJS 10 REST and WebSocket backend.
- `xstreamroll-sdk`: Lightweight, isomorphic TypeScript client for publishing events and API interaction.
- `xstreamroll-processing`: Dedicated Node.js and TypeScript worker for real-time stream data processing.
- `database`: Initial PostgreSQL schema and migrations.

<!-- Links -->

[Unreleased]: https://github.com/XStreamRollz/XStreamRoll/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/XStreamRollz/XStreamRoll/releases/tag/v1.0.0
