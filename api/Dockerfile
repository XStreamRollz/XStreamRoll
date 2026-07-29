FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
# Issue #340: include SQL migration files so the k8s init container can run
# `node-pg-migrate up -d /app/database/migrations -m sql` without a separate
# ConfigMap mount. Keeps the runner, schema, and runtime image in lockstep
# from a single published artifact.
COPY --from=builder --chown=appuser:appgroup /app/database/migrations ./database/migrations
USER appuser
EXPOSE 3001
CMD ["node", "dist/main.js"]
