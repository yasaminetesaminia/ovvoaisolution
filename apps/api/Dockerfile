# Multi-stage build for the Lavora API.
#
# Stage 1: install all monorepo deps + build TypeScript output for the
# api app and its workspace deps (db, core).
#
# Stage 2: ship a slim runtime image that only contains node_modules
# and the compiled .js. We don't need the full source tree, the rest
# of the apps (web, workers), or the Prisma engines we don't use.

FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

RUN npm install -g pnpm@9.15.9

# Copy lockfile + workspace manifests so pnpm can resolve everything
# without yet copying the full source tree (better Docker layer caching).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/core/package.json ./packages/core/
COPY packages/calendar/package.json ./packages/calendar/
COPY packages/chat/package.json ./packages/chat/

RUN pnpm install --frozen-lockfile

# ----------------------------------

FROM deps AS build
WORKDIR /app

# Now bring in the rest of the source.
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Generate the Prisma client (needs schema.prisma + the engines binary).
RUN pnpm --filter "@lavora/db" exec prisma generate

# tsx runs TypeScript directly so we don't need a tsc step for the api;
# we just keep the source. (If we later switch to compiled output, add
# a `pnpm --filter @lavora/api build` here.)

# ----------------------------------

FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

COPY --from=build /app /app

# Drop root for runtime.
RUN addgroup -g 1001 -S nodejs && adduser -S lavora -u 1001
USER lavora

EXPOSE 8787

# tsx is included in the api app's dev deps; in production we run via
# tsx so we don't have to maintain a separate build pipeline for now.
WORKDIR /app/apps/api
CMD ["node", "--import", "tsx", "src/index.ts"]
