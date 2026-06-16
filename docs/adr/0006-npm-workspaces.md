# 6. npm Workspaces Monorepo Structure

## Status

Accepted

## Context

The XStreamRoll platform consists of multiple services and libraries: the web frontend (`app`), the API backend (`api`), the client SDK (`xstreamroll-sdk`), and the stream processing worker (`xstreamroll-processing`). If these are split into individual git repositories, developers face friction managing multiple checkouts, local symlinking, coordinating branches, and sharing TypeScript interfaces.

## Decision

We will use npm workspaces to organize the codebase as a single monorepo. The root `package.json` defines the `workspaces` array containing the sub-projects.

Key advantages:

- **Unified Dependency Management**: A single root `package-lock.json` manages and resolves dependencies across all projects, preventing version drift.
- **Root Scripts**: Developers can execute tasks (such as linting, formatting, building, and running) for all packages or specific packages directly from the root workspace directory.
- **Local Linking**: Internal packages (like importing types or helpers from `xstreamroll-sdk` into the `api`) are symlinked automatically by npm, making local edits immediately visible.

## Consequences

- **Atomic Changes**: A single pull request can implement a feature that spans database schema changes, SDK updates, API endpoints, and frontend UI, ensuring they are reviewed and merged together.
- **Simplified Onboarding**: A new team member only needs to clone one repository and run `npm run install:all` to set up their complete local environment.
- **Tooling Complexity**: Monorepos require careful configuration of ESLint, Prettier, and TypeScript to ensure settings propagate correctly to workspaces while avoiding conflicts.
- **Deployment Isolation**: Even though code is co-located, the build and deployment processes (e.g., Docker builds) must be isolated to ensure only the target service is built and deployed.
