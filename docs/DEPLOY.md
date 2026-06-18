# Deploying the Pollendar API

Production deploy guide for the NestJS 11 / Prisma 7 backend against MySQL 8.4.
The image is built from `backend/` via a multi-stage [`backend/Dockerfile`](../backend/Dockerfile);
on container start the entrypoint runs `prisma migrate deploy` and then serves the API.

The deploy is intentionally platform-agnostic: a single Docker image plus
`prisma migrate deploy`. Any host that can run a container and reach a MySQL 8.4
database and an SMTP relay will work.

## Build

The build context is `backend/` (the Dockerfile, `.dockerignore`, and
`docker-entrypoint.sh` all live there):

```bash
docker build -t pollendar-api:<tag> ./backend
```

The build runs in two stages:

1. **builder** — `npm ci`, `npx prisma generate` (classic `prisma-client-js`
   client → `node_modules/.prisma` + `@prisma/client`), then `npm run build`
   (NestJS → `dist/`).
2. **runtime** — `npm ci --omit=dev` for production deps, then copies `dist/`,
   `prisma/` (schema + migrations), `prisma.config.ts`, and the generated Prisma
   client from the builder. Node is pinned to 24 on both stages.

## Run order

On start, [`docker-entrypoint.sh`](../backend/docker-entrypoint.sh):

1. runs `npx prisma migrate deploy` — applies the committed migrations in
   `backend/prisma/migrations/` (idempotent; already-applied migrations are
   skipped), then
2. `exec node dist/src/main` — boots the API under the `/api` global prefix on
   `API_PORT`.

**Migrate before you serve.** If you prefer to run migrations as a separate
job/step (e.g. a Kubernetes init container or a one-off `docker run … npx prisma
migrate deploy`) rather than from the entrypoint, you must still run
`prisma migrate deploy` **before** starting the app container so the schema is
current when the API boots.

> `prisma migrate deploy` is the only migration command that is safe in
> production. Never run `prisma migrate dev` or `prisma migrate reset` against a
> production database — both are destructive. The seed (`tsx prisma/seed.ts`) is
> a dev/test convenience and is **not** run in production.

## Required production environment

The app validates its environment on boot (`src/config/env.validation.ts`) and
**fails fast** if a required variable is missing or invalid. Provide all of the
following:

| Variable | Required | Example / notes |
|----------|----------|-----------------|
| `NODE_ENV` | yes | `production` |
| `API_PORT` | yes | `3000` (matches the image's `EXPOSE`) |
| `APP_URL` | yes | Public base URL of the API |
| `CORS_ORIGINS` | yes | Comma-separated allow-list of the real frontend origin(s), e.g. `https://app.example.com`. **Never `*`** — CORS runs with `credentials: true` |
| `DATABASE_URL` | yes | MySQL 8.4 connection string (`mysql://user:pass@host:3306/pollendar`); consumed by both the app and `prisma.config.ts` |
| `JWT_ACCESS_SECRET` | yes | Strong unique secret — inject via a secret manager, never bake into the image |
| `JWT_REFRESH_SECRET` | yes | Strong unique secret — separate from the access secret |
| `ACCESS_TOKEN_TTL` | yes | Duration string, e.g. `15m` |
| `REFRESH_TOKEN_TTL` | yes | Duration string, e.g. `30d` |
| `MAGIC_LINK_TTL` | yes | Duration string, e.g. `15m` |
| `COOKIE_SECURE` | yes (prod) | `true` — required for HTTPS-only session cookies |
| `COOKIE_DOMAIN` | optional | Real registered domain for the session cookie. Leave **unset** for host-only cookies; never an IP literal (invalid per RFC 6265) |
| `SMTP_HOST` | yes | SMTP relay host |
| `SMTP_PORT` | yes | e.g. `587` |
| `SMTP_SECURE` | yes | `true`/`false` per your relay (TLS) |
| `SMTP_USER` | optional* | Relay username (*required by most real relays; only optional for auth-less dev relays like Mailpit) |
| `SMTP_PASSWORD` | optional* | Relay password (same caveat as `SMTP_USER`) |
| `MAIL_FROM` | yes | From address for magic-link / results emails |
| `THROTTLE_TTL` | yes | Rate-limit window in **seconds**, e.g. `60` |
| `THROTTLE_LIMIT` | yes | Max requests per window, e.g. `10` |

## Secrets

Inject `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, and the
`SMTP_*` credentials at runtime via environment variables from your platform's
secret manager. **Never** bake secrets into the image or commit them. The local
`.env` is git-ignored and excluded from the build context by `.dockerignore`, so
it never enters the image.

## Production security checklist

These controls are already enforced in code (existing wiring + the hardening
phases of this plan). Verify the runtime configuration upholds them:

- [ ] **`COOKIE_SECURE=true`** so session cookies are sent only over HTTPS.
- [ ] Session cookies are `httpOnly` with `sameSite: 'lax'`
      (`src/auth/cookie.util.ts`) — no app config needed, just confirm.
- [ ] **`CORS_ORIGINS` is an explicit allow-list**, never `*`, listing only the
      real SPA origin(s) (CORS runs with `credentials: true`).
- [ ] **`COOKIE_DOMAIN`** is unset (host-only) or the exact registered apex
      domain — never an IP literal.
- [ ] Magic-link requests stay **anti-enumeration**: `POST /api/auth/magic-link`
      always returns `200 { ok: true }` regardless of whether the email exists.
- [ ] Public poll/results endpoints **never leak participant emails** or owner
      identity (aggregate counts + best slot only).
- [ ] The global exception filter (`src/common/prisma-exception.filter.ts`) maps
      unhandled Prisma errors to clean HTTP codes without leaking DB internals.
