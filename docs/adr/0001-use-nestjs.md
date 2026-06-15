# 1. Use NestJS as API Backend Framework

## Status

Accepted

## Context

The backend API server (`/api`) needs to handle business logic, database queries, authentication, and real-time streaming updates. Standard Node.js frameworks like Express.js are minimal and un-opinionated, which often leads to inconsistent codebase structures, lack of clear separation of concerns, and fragmented implementation of features (such as validation, error handling, and dependency injection) across teams.

## Decision

We will use NestJS as our core API backend framework. NestJS provides an out-of-the-box application architecture (Modules, Controllers, and Services) and native support for TypeScript. It allows us to leverage:

- **Dependency Injection (DI)** for managing service and repository instances, improving testability.
- **Decorators and Guards** for clean routing, validation (via `class-validator`), and JWT authentication.
- **First-class WebSocket integrations** via the `@nestjs/websockets` module to handle real-time events.

## Consequences

- **Consistency**: Developers follow the same architectural patterns (Modules, Controllers, Services) for organizing logic, making onboarding and codebase navigation easier.
- **Architecture**: Clear separation of concerns is enforced by the framework structure, keeping HTTP controllers detached from business services and data layers.
- **Learning Curve**: NestJS introduces a learning curve due to its reliance on decorators, TypeScript-specific features, and module organization patterns.
- **Boilerplate**: Slightly more boilerplate code is required to set up simple endpoints compared to Express, but this is offset by the structured scalability of the codebase.
