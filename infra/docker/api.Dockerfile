# syntax=docker/dockerfile:1
# Production image for the Fastify API. Build from the repository root:
#   docker build -f infra/docker/api.Dockerfile -t reading-tracker-api .

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /repo

# ---- Build -----------------------------------------------------------------
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Dependency patches (fontkit fix for Khmer PDF text) must exist before install.
COPY patches patches
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @rt/api...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @rt/api build \
  # Production-only dependencies for the runtime stage (workspace code is bundled by tsup).
  && pnpm --filter @rt/api deploy --prod --legacy /out \
  && cp -r apps/api/dist apps/api/prisma apps/api/prisma.config.ts apps/api/assets /out/

# ---- Runtime ---------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini && addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /out ./
USER app
EXPOSE 4010
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4010/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
# Apply pending migrations, then start. Migrations are idempotent and run in a transaction.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/server.js"]
