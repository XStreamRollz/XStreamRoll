# Architecture Decision Records (ADR)

This directory contains Architecture Decision Records for the XStreamRoll platform. Each ADR documents a significant design decision, including the context, the chosen approach, alternatives considered, and consequences.

## Index

| # | Title | Status | Description |
|---|-------|--------|-------------|
| 1 | [Use NestJS as API Backend Framework](0001-use-nestjs.md) | ✅ Accepted | Adoption of NestJS with modules, controllers, services, DI, and WebSocket integration. |
| 2 | [In-Memory-First Repository Pattern](0002-in-memory-first.md) | ✅ Accepted | Repository pattern with in-memory implementations for rapid feature development, replaceable with DB-backed versions. |
| 3 | [Polling-Based Stream Processing](0003-polling-based-processing.md) | ✅ Accepted | Pull-based worker architecture. Periodic HTTP polling instead of a message broker. |
| 4 | [Raw SQL (pg) over ORM](0004-raw-sql-over-orm.md) | ✅ Accepted | Using `node-postgres` with raw SQL rather than Prisma, TypeORM, or Sequelize. |
| 5 | [Socket.IO for Real-time Communication](0005-socket-io-realtime.md) | ✅ Accepted | Socket.IO for WebSocket communication with room-based stream subscriptions. |
| 6 | [npm Workspaces Monorepo Structure](0006-npm-workspaces.md) | ✅ Accepted | Single monorepo with npm workspaces for API, SDK, processing worker, and frontend. |
| 7 | [OpenAPI-to-TypeScript Code Generation for the SDK](0007-openapi-typescript-codegen.md) | ✅ Accepted | Using `openapi-typescript` to generate SDK types from the NestJS OpenAPI spec. |
| 8 | [Horizontal Worker Scaling via Distributed Lock Manager](0008-horizontal-worker-scaling.md) | ✅ Accepted | PostgreSQL-backed distributed lock manager for coordinating stream processing across multiple worker replicas. |

## Conventions

- Each ADR is a Markdown file in this directory.
- File names follow the pattern `NNNN-title-slug.md` where `NNNN` is a zero-padded, sequentially-assigned number.
- ADRs are immutable once accepted — amendments are handled by superseding ADRs or creating new ones.
- The status column in the index above reflects the current state of each decision.
