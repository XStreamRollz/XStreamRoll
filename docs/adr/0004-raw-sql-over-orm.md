# 4. Raw SQL (pg) over ORM

## Status

Accepted

## Context

The backend application requires interaction with a PostgreSQL database for tasks like user authentication and audit logging. In the Node.js and NestJS ecosystem, Object-Relational Mappers (ORMs) like Prisma, TypeORM, or Sequelize are standard choices to abstract SQL. However, ORMs introduce significant runtime abstractions, can generate complex and sub-optimal SQL queries, make performance tuning harder, and add compile-time dependencies.

## Decision

We will write raw SQL queries directly using the native node-postgres (`pg`) client driver.

To maintain clean code and protect the application:

- All SQL queries must be localized inside repository files (e.g., `UsersRepository`). The rest of the application (services, controllers) must never see SQL strings or connection details.
- All query inputs must use query parameterization (e.g., `$1`, `$2`) to prevent SQL injection vulnerabilities.
- Database migrations and schemas are maintained as raw SQL files in the `database/` directory.

## Consequences

- **Maximum Performance**: Zero ORM translation overhead. Queries are executed directly as written, reducing CPU usage and latency.
- **Query Control**: The engineering team has complete control over SQL execution, query planning, indexing strategy, and schema definitions.
- **Manual Mapping**: Result sets from the database must be manually mapped to TypeScript interfaces, which increases the risk of type mismatches if schemas change without corresponding updates to repository code.
- **Migration Overhead**: Schema migrations must be managed through manual SQL scripts (like `database/schema.sql`) rather than automatic ORM sync tools or custom schema builders.
