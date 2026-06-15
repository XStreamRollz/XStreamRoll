# 2. In-Memory-First Repository Pattern

## Status

Accepted

## Context

The backend application requires data persistence for entities like streams, tags, and users. Connecting directly to database clients (such as PostgreSQL) within service layers couples business logic to the database engine. This makes testing harder (requiring database mocks or local test instances) and slows down development velocity when schemas or entity structures are still evolving.

## Decision

We will design data-access layers using the Repository Pattern, adopting an in-memory-first approach for new features (e.g., `StreamsRepository`, `TagsRepository`). Higher-level service and controller modules must only depend on the public methods of these repositories.

The repository implementations initially utilize in-memory collections (such as JavaScript `Map` structures) to manage and store entities. Once the database schema is finalized and the integration is ready, we can rewrite the repository implementations to query the database, or swap them for database-backed repository classes without changing the service or controller layers.

## Consequences

- **Development Velocity**: API features, endpoint contracts, and frontend views can be designed, built, and tested rapidly without waiting for database migrations or table schemas to be finalized.
- **Simplified Testing**: Unit tests for services run instantly and reliably without mock database connections, as they can interact with the lightweight in-memory repository implementation directly.
- **Encapsulation**: Storage and database details are fully hidden within repository files, keeping services focused purely on business logic.
- **Volatile State**: In-memory storage is volatile, meaning data resets on every application restart. For multi-instance staging or production environments, in-memory repositories are not viable and must be replaced with PostgreSQL-backed implementations (similar to `UsersRepository`).
