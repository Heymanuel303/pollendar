# syntax=docker/dockerfile:1
#
# Multi-stage production image for the Pollendar NestJS API.
# Build context is ./backend (see docs/DEPLOY.md). The base is pinned to the exact
# repo runtime (node v24.11.1, which bundles npm 11.6.2 — the npm that wrote
# package-lock.json) so `npm ci` reads the lockfile identically; the floating
# `node:24-slim` tag ships a newer npm that rejects the lockfile over optional
# transitive (@emnapi) deps. Both stages share the same base so any
# platform-specific Prisma client artifacts generated in the builder are valid
# at runtime.

# ---- builder: install full deps, generate the Prisma client, compile to dist/ ----
FROM node:24.11.1-bookworm-slim AS builder
WORKDIR /app

# Install all deps (incl. devDependencies — @nestjs/cli, ts-loader, prisma) needed
# for `prisma generate` and `nest build`. Copy lockfiles first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the backend source (build context is ./backend).
COPY . .

# Generate the classic prisma-client-js client (emits to node_modules/.prisma and
# node_modules/@prisma/client) and compile the NestJS app to dist/.
RUN npx prisma generate
RUN npm run build

# ---- runtime: production deps + compiled output only ----
FROM node:24.11.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production-only deps. Keeps `prisma` (for `migrate deploy`), `pg` and
# `@prisma/adapter-pg` (Prisma 7 connects through the driver adapter, not a
# bundled query engine), and dotenv (pulled in transitively by @nestjs/config and
# the Prisma config loader).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compiled app + the Prisma schema/migrations + the Prisma 7 config. prisma.config.ts
# supplies DATABASE_URL and the migrations path to `prisma migrate deploy`.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# The Prisma client generated in the builder. The runtime `npm ci` only installs the
# unpopulated @prisma/client stub, so overlay the generated client + .prisma output so
# it matches the build exactly.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Migrate-then-serve entrypoint; `exec node` makes node PID 1 so it receives SIGTERM
# directly for graceful shutdown.
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Default API_PORT (override via env). The app validates env on boot and fails fast.
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
