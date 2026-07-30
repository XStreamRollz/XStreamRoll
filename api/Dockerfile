# Build context: repo root (not api/) — required so pnpm can resolve file:
# workspace dependencies (@xstreamroll/types, @xstreamroll/contract-tests).
FROM node:20-alpine AS builder
WORKDIR /app

# ── Workspace package manifests (needed for pnpm file: resolution) ────────────
COPY package.json ./
COPY packages/types/package.json packages/types/tsconfig.json ./packages/types/
COPY packages/types/src/ ./packages/types/src/
COPY tests/contracts/package.json tests/contracts/tsconfig.json ./tests/contracts/
# Issue #340: include SQL migration files so the k8s init container can run
# `node-pg-migrate up -d /app/database/migrations -m sql` without a separate
# ConfigMap mount. Keeps the runner, schema, and runtime image in lockstep
# from a single published artifact.
COPY database/migrations/ ./database/migrations/

# ── API package manifests and install ─────────────────────────────────────────
COPY api/package.json api/pnpm-lock.yaml api/pnpm-workspace.yaml ./api/
WORKDIR /app/api
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# ── Copy remaining API source and build ───────────────────────────────────────
COPY api/ ./
RUN pnpm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder --chown=appuser:appgroup /app/api/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/api/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/database/migrations ./database/migrations
USER appuser
EXPOSE 3001
CMD ["node", "dist/main.js"]
