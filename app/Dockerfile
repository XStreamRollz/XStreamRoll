# Build context: repo root (not app/) — required so npm can resolve the
# file: workspace dependency @xstreamroll/types (file:../packages/types).
FROM node:20-alpine AS builder
WORKDIR /app

# Copy app package manifest
COPY app/package.json ./

# Copy workspace dependency so npm can resolve file:../packages/types
COPY packages/types/package.json packages/types/tsconfig.json /packages/types/
COPY packages/types/src/ /packages/types/src/

RUN npm install

# Copy app source
COPY app/ ./

# Ensure public directory exists (optional in Next.js, but the runner stage
# expects it for static asset serving).
RUN mkdir -p public

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_ vars are inlined into the client bundle at build time, so
# they must be supplied as build args (not just runtime env) to take effect.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_VIEWER_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_VIEWER_URL=${NEXT_PUBLIC_VIEWER_URL}

RUN npm run build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appgroup /app/public ./public

USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
