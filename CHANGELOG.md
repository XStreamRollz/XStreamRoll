# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Kubernetes deployment manifests for API, App, Processing Worker, and PostgreSQL (`#217`).
- Health check endpoints (`/api/health`, `/livez`, `/healthz`) to support container orchestrator probes.
- `SECURITY.md` policy covering supported versions, SLAs, and private vulnerability reporting.
- Comprehensive `CONTRIBUTING.md` guide covering monorepo setup, conventional commits, and PR expectations.
- PostgreSQL-backed `TagsDbRepository` and `StreamsDbRepository` for secure, parameterized data access.
- User registration page (`/auth/register`) in the Next.js frontend with Zod schema validation.

### Changed

- `StreamOwnershipService` in API backend now safely queries the PostgreSQL database via parameterized queries instead of relying on demo environment variables.
- Prepared `AdminStatsService` for database integration to aggregate platform-wide stats.

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
