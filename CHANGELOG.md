# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Automation**: Starting from `v1.1.0`, this file is generated automatically by
> [`conventional-changelog`](https://github.com/conventional-changelog/conventional-changelog).
> Run `npm run changelog` to regenerate. All commits must follow the
> [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification
> enforced by `commitlint` + `husky`.

---

## [Unreleased]

### Added

- Kubernetes deployment manifests for API, App, Processing Worker, and PostgreSQL (`#217`).
- Health check endpoints (`/api/health`, `/livez`, `/healthz`) to support container orchestrator probes.
- `SECURITY.md` policy covering supported versions, SLAs, and private vulnerability reporting.
- Comprehensive `CONTRIBUTING.md` guide covering monorepo setup, conventional commits, and PR expectations.
- PostgreSQL-backed `TagsDbRepository` and `StreamsDbRepository` for secure, parameterized data access.
- User registration page (`/auth/register`) in the Next.js frontend with Zod schema validation.
- Distributed session coordination for the processing worker (`#216`).
- Unit tests for `StreamsService` and `StreamsController`.
- Dark mode coverage for UI components.
- Shared connection pool management (`#139`).
- Unit tests for `TagsService`, `TagsController`, and `slugify` utility (`#202`).
- Frontend component tests for core UI.
- Strict rate limiting and failure logging on auth endpoints (`#188`).
- Example environment files for `api`, `app`, `processing`, and `sdk`.
- Issue templates: bug report and feature request (`#288`).
- Prometheus metrics endpoint on API (`#219`).
- Role-based access control on `AdminAuditController`.
- `CODEOWNERS` file for PR review automation (`#272`).
- `StreamsGateway` WebSocket integration tests (`#273`).
- End-to-end integration tests for stream processing pipeline (`#274`).
- `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1) (`#277`).
- Up/down migration for `password_hash` column (`#278`).
- Pull request template (`#281`).

### Changed

- `StreamOwnershipService` in API backend now safely queries the PostgreSQL database via parameterized queries instead of relying on demo environment variables.
- Prepared `AdminStatsService` for database integration to aggregate platform-wide stats.

### Fixed

- UI `ConfirmDialog` component now properly handles async states and prevents dialog dismissal while action promises are pending.
- Unified JWT config — single expiry constant across all consumers (`#304`).
- Enforced JWT secret and removed hardcoded fallbacks (`#295`).
- Restricted WebSocket CORS to trusted origins (`#296`).
- Restricted status values in `UpdateStreamDto` (`#291`).
- Proper password reset flow (`#279`).
- Duplicate register page removed (`#280`).

### Security

- Enforced JWT secret; removed hardcoded fallbacks (`#295`).
- Restricted WebSocket CORS to trusted origins (`#296`).

---

## [1.0.0] - 2026-05-16

This is the first stable release of XStreamRoll. The changelog below was
backfilled from the full commit history using `git log`.

### Added

#### Platform Foundations
- Initial monorepo scaffold with XStreamRoll branding (`2026-01-15`).
- `app`: Next.js 16 user-facing web frontend.
- `api`: NestJS 10 REST and WebSocket backend.
- `xstreamroll-sdk`: Lightweight, isomorphic TypeScript client for publishing events and API interaction.
- `xstreamroll-processing`: Dedicated Node.js + TypeScript worker for real-time stream data processing.
- `database`: Initial PostgreSQL schema with `stream_tags` + `tags` tables for stream categorization (`#108`).

#### API (`api/`)
- User registration and login endpoints (`#9`, `#134`).
- Stream CRUD REST endpoints (`#5`, `#136`).
- `GET /tags` and stream-scoped tag management endpoints (`#107`).
- Global `ValidationPipe` with strict whitelist mode (`#104`).
- WebSocket streaming gateway (`#106`).
- Swagger / OpenAPI documentation served from `/docs` (`#105`).
- Admin stats endpoint with caching (`#109`).
- Response compression middleware (`#113`).
- HTML sanitization pipe (`#114`).
- Helmet middleware and proper CORS configuration (`#118`).
- Rate limiting on all public endpoints (`#119`).
- Audit log for sensitive actions (`#120`).
- Environment variable validation on startup (`#122`).
- Pagination for list endpoints and health endpoint (`#129`).
- Request logging middleware (`#57`).

#### Frontend (`app/`)
- Dark / light mode toggle with `next-themes` (`#16`, `#130`).
- Stream creation form with `react-hook-form` + Zod (`#17`, `#131`).
- Responsive navigation sidebar (`#18`, `#132`).
- Error boundary and global error page (`#19`, `#133`).
- Stream tagging UI with multi-select combobox (`#112`).
- Admin stats dashboard page (`#111`).
- WebSocket stream viewer component (real-time).
- Authentication pages and route protection (`#124`).
- Stream embed code generator on stream detail page (`#117`).
- Navbar notifications dropdown (`#116`).
- Server-side query result caching for streams (`#115`).
- Reusable `ConfirmDialog` for destructive actions (`#68`).
- `StreamStatusBadge` component (`#67`).
- Global `Toaster` mount and unified toast helper (`#22`).

#### SDK (`xstreamroll-sdk/`)
- TypeScript type exports for all API models.
- Retry helper wired into `HttpClient` (`#36`).
- Comprehensive SDK documentation (`#35`).
- Integration tests and standardized `ApiError` handling.

#### Processing Worker (`xstreamroll-processing/`)
- Structured JSON logger with correlation IDs (`#31`).
- `GracefulShutdown` coordinator (`#30`).
- Unit suite for the stream pipeline (`#32`).
- Support for multiple concurrent stream sessions (`#110`).

#### DevOps / CI
- GitHub Actions release workflow for Docker images (`#85`, `#121`).
- Code coverage reporting to CI (`#86`, `#123`).
- Root ESLint and Prettier configuration (`#42`).
- Architecture decision records (ADRs).
- Contributing guide (`#103`).

### Fixed

- Issues `#73`, `#75`, `#79` — various bug fixes (`#127`).
- Issues `#80`, `#83`, `#84` — Dockerfiles and SDK auth methods (`#126`).
- Issues `#77`, `#78`, `#81`, `#82` — mixed fixes (`#125`).
- Unit tests for auth service (`#12`, `#135`).
- Lint and test configuration across packages.
- Type annotations for child arrow params and event-filter test in processing worker.
- Closed shared `http.Agent` on worker graceful shutdown (`#225`).
- TypeScript target bumped to ES2020 consistently across all packages.
- Repository package names corrected in docs.

### Removed

- Dependabot config (reverted to stop automated version bump PRs).

---

<!-- Links -->

[Unreleased]: https://github.com/XStreamRollz/XStreamRoll/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/XStreamRollz/XStreamRoll/releases/tag/v1.0.0
