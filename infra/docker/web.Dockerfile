# syntax=docker/dockerfile:1
# Production image for the Next.js web app (standalone output). Build from the repository root:
#   docker build -f infra/docker/web.Dockerfile -t reading-tracker-web .

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /repo

# ---- Build -----------------------------------------------------------------
FROM base AS build
# Rewrites and NEXT_PUBLIC_* values are baked in at build time.
ARG API_INTERNAL_URL=http://api:4010
ARG NEXT_PUBLIC_TIME_ZONE=Asia/Phnom_Penh
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_PUBLIC_TIME_ZONE=$NEXT_PUBLIC_TIME_ZONE \
    NEXT_TELEMETRY_DISABLED=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Dependency patches (fontkit fix for Khmer PDF text) must exist before install.
COPY patches patches
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @rt/web...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @rt/web build

# ---- Runtime ---------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN apk add --no-cache tini && addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
