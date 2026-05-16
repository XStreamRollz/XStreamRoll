# Contributing to XStreamRoll

Thanks for your interest in contributing to XStreamRoll. This guide walks you through the local setup of every package in the monorepo, the branching strategy, our commit message conventions, the pull request process, and what to expect during code review.

If anything below is unclear, please open an issue using one of the [issue templates](.github/ISSUE_TEMPLATE) so we can improve this guide.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Repository Layout](#repository-layout)
3. [Local Setup](#local-setup)
   - [Prerequisites](#prerequisites)
   - [Clone & Bootstrap](#clone--bootstrap)
   - [Per-Package Setup](#per-package-setup)
4. [Branching Strategy](#branching-strategy)
5. [Commit Message Conventions](#commit-message-conventions)
6. [Pull Request Process](#pull-request-process)
7. [Code Review Expectations](#code-review-expectations)
8. [Reporting Issues](#reporting-issues)

---

## Code of Conduct

By participating in this project you agree to uphold a respectful, inclusive, and harassment-free environment. Treat every contributor with kindness. Disagreements about code are welcome; personal attacks are not.

---

## Repository Layout

XStreamRoll is a monorepo managed with npm workspaces. The four packages are:

| Path                       | Stack                          | Description                                           |
| -------------------------- | ------------------------------ | ----------------------------------------------------- |
| `app/`                     | Next.js 16 + TypeScript        | User-facing web frontend                              |
| `api/`                     | NestJS 10 + TypeScript         | REST + WebSocket backend                              |
| `xstreamroll-sdk/`         | TypeScript                     | Client SDK for publishing events & calling the API    |
| `xstreamroll-processing/`  | Node.js + TypeScript           | Stream-processing worker                              |
| `database/`                | PostgreSQL                     | Schema and migrations                                 |

See [`REPOSITORIES.md`](./REPOSITORIES.md) for a deeper breakdown.

---

## Local Setup

### Prerequisites

- **Node.js** ≥ 18 (Node 20 LTS recommended)
- **npm** ≥ 9 (bundled with Node)
- **PostgreSQL** ≥ 14
- **Git** ≥ 2.30

> Tip: use [`nvm`](https://github.com/nvm-sh/nvm) to manage Node versions.

### Clone & Bootstrap

```bash
git clone https://github.com/XStreamRollz/XStreamRoll.git
cd XStreamRoll
npm run install:all
```

`install:all` installs the root workspace and every package's dependencies.

Copy the environment templates:

```bash
cp app/.env.example                   app/.env
cp api/.env.example                   api/.env
cp xstreamroll-sdk/.env.example       xstreamroll-sdk/.env
cp xstreamroll-processing/.env.example xstreamroll-processing/.env
```

Then load the database schema:

```bash
psql -d xstreamroll_dev -f database/schema.sql
```

Start everything in development mode:

```bash
npm run dev          # runs app + api concurrently
# or, individually:
npm run dev:app      # http://localhost:3000
npm run dev:api      # http://localhost:3001
```

### Per-Package Setup

#### `app/` — Frontend (Next.js)

```bash
cd app
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm test           # unit + component tests
```

Environment variables of interest:

- `NEXT_PUBLIC_API_URL` — base URL of the API service.

#### `api/` — Backend (NestJS)

```bash
cd api
npm install
npm run dev        # nest start --watch on :3001
npm run build      # nest build → dist/
npm run lint       # eslint
```

Environment variables of interest:

- `DATABASE_URL` — PostgreSQL connection string.
- `JWT_SECRET`   — secret used to sign access tokens.
- `STREAM_API_KEY` — API key for stream authentication.

The OpenAPI/Swagger UI is served from `http://localhost:3001/docs` once running.

#### `xstreamroll-sdk/` — Client SDK

```bash
cd xstreamroll-sdk
npm install
npm run build      # emits dist/ with .js + .d.ts
npm test
```

Publish a new version only after a maintainer-approved PR is merged.

#### `xstreamroll-processing/` — Stream Worker

```bash
cd xstreamroll-processing
npm install
npm run start      # boots the worker on :3002
```

Environment variables of interest:

- `DATABASE_URL`  — PostgreSQL connection string.
- `STREAM_QUEUE_URL` — broker URL (Redis / NATS / etc.).

---

## Branching Strategy

We use trunk-based development with short-lived feature branches off `main`.

| Prefix    | Purpose                                        | Example                                |
| --------- | ---------------------------------------------- | -------------------------------------- |
| `feat/`   | New user-facing functionality                  | `feat/stream-tags-endpoint`            |
| `fix/`    | Bug fixes                                      | `fix/websocket-disconnect-leak`        |
| `chore/`  | Tooling, deps, refactors with no user impact   | `chore/bump-nestjs-10.4`               |
| `docs/`   | Documentation-only changes                     | `docs/update-contributing-guide`       |
| `test/`   | Adding or refactoring tests                    | `test/api-validation-suite`            |
| `ci/`     | CI / GitHub Actions changes                    | `ci/cache-pnpm-store`                  |

Conventions:

- Branch directly off the latest `main`. **Rebase**, do not merge, to keep up to date.
- Keep branches focused — one logical change per branch.
- Issue-driven branches may use `fix/assigned-issue-<ID>` or `feat/issue-<ID>-<slug>`.
- Delete the remote branch after the PR is merged.

---

## Commit Message Conventions

We follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). Each commit must look like:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Allowed types:** `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`.

**Scope** is the affected package or area: `api`, `app`, `sdk`, `processing`, `db`, `ci`, `deps`, etc.

**Subject rules:**

- Imperative mood, lowercase, no trailing period.
- ≤ 72 characters.
- Reference the issue in the footer with `Refs #<id>` or `Closes #<id>`.

**Examples:**

```
feat(api): add GET /tags endpoint with pagination

Adds the public tags listing endpoint backed by a new TagsService and
TagsRepository. Results are paginated via `?page=` and `?limit=` query
params (max 100/page).

Closes #101
```

```
fix(api): release socket on JWT verification failure

Closes #6
```

```
docs(repo): add contributing guide

Closes #102
```

Breaking changes append `!` after the type/scope and include a `BREAKING CHANGE:` footer.

---

## Pull Request Process

1. **Sync with `main`** before opening the PR:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
2. **Run quality gates locally**:
   ```bash
   npm run lint
   npm run build
   npm test
   ```
3. **Open the PR** using `gh pr create` or the GitHub UI.
   - Title format: `<type>(<scope>): <summary>` (matches Conventional Commits).
   - Link the issue: `Closes #<id>` in the body.
   - Fill out the PR template — describe the *why*, list the testing performed, attach screenshots for UI changes.
4. **Required checks** must pass: lint, build, unit tests, and any service-specific E2E suites.
5. **Request review** from at least one CODEOWNER for each touched package.
6. **Address review feedback** with fixup commits, then `git rebase -i --autosquash` before merge.
7. **Merge strategy**: squash-and-merge is the default. The squash commit message must remain Conventional Commits compliant.

---

## Code Review Expectations

**For authors:**

- Keep PRs small (< 400 lines diff when possible). Split larger work behind feature flags.
- Self-review before requesting review. Catch the obvious stuff first.
- Reply to every review comment — either with a code change or a clear rationale.
- Don't force-push after review starts; use fixup commits and rebase right before merge.

**For reviewers:**

- First review within 1 business day of being assigned.
- Be specific and kind. Quote the line, explain the concern, propose an alternative.
- Use review verbs intentionally:
  - **Comment** — observation, no action needed.
  - **Request changes** — must be resolved before merge.
  - **Approve** — ready to merge once CI is green.
- Approve only after pulling the branch and verifying the change locally if it touches critical paths (auth, payments, streaming pipeline).

**Definition of Done:**

- All required checks green.
- At least one CODEOWNER approval per touched package.
- No unresolved review threads.
- Issue linked via `Closes #<id>`.

---

## Reporting Issues

Use the appropriate template under [`.github/ISSUE_TEMPLATE`](.github/ISSUE_TEMPLATE):

- **Bug report** — for reproducible defects.
- **Feature request** — for new functionality.
- **Documentation** — for missing or incorrect docs.

If an issue template does not exist yet for the kind of issue you want to raise, open a generic issue and a maintainer will route it.

---

Thanks for contributing to XStreamRoll. We appreciate your time and care.
