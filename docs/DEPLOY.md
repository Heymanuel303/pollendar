# Deploying the Pollendar API

Production deploy guide for the NestJS 11 / Prisma 7 backend against PostgreSQL 16.
The image is built from `backend/` via a multi-stage [`backend/Dockerfile`](../backend/Dockerfile);
on container start the entrypoint runs `prisma migrate deploy` and then serves the API.

The deploy is intentionally platform-agnostic: a single Docker image plus
`prisma migrate deploy`. Any host that can run a container and reach a PostgreSQL 16
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
| `DATABASE_URL` | yes | PostgreSQL 16 connection string (`postgresql://user:pass@host:5432/pollendar`); consumed by both the app and `prisma.config.ts` |
| `JWT_ACCESS_SECRET` | yes | Strong unique secret — inject via a secret manager, never bake into the image |
| `JWT_REFRESH_SECRET` | yes | Strong unique secret — separate from the access secret |
| `ACCESS_TOKEN_TTL` | yes | Duration string, e.g. `15m` |
| `REFRESH_TOKEN_TTL` | yes | Duration string, e.g. `30d` |
| `MAGIC_LINK_TTL` | yes | Duration string, e.g. `15m` |
| `COOKIE_SECURE` | yes (prod) | `true` — required for HTTPS-only session cookies |
| `COOKIE_DOMAIN` | optional | Real registered domain for the session cookie. Leave **unset** for host-only cookies; never an IP literal (invalid per RFC 6265) |
| `SMTP_HOST` | yes | `smtp.resend.com` (Resend's fixed SMTP host) |
| `SMTP_PORT` | yes | `465` (with `SMTP_SECURE=true`) or `587` (STARTTLS, with `SMTP_SECURE=false`) |
| `SMTP_SECURE` | yes | `true` for port 465; `false` for port 587 |
| `SMTP_USER` | yes | the literal string `resend` (Resend's fixed SMTP username) |
| `SMTP_PASSWORD` | yes | the Resend API key (`re_...`) — inject via secret manager, never bake into the image |
| `MAIL_FROM` | yes | `"Pollendar <pollendar@heymanuel.ch>"` — must be on a Resend-verified domain |

> **Production email = Resend SMTP; dev/e2e = Mailpit.** The switch is purely
> env-driven — the same nodemailer `MailService` (no code change) talks to Resend
> in production and Mailpit locally. For **local dev** point the same vars at
> Mailpit instead: `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURE=false`,
> empty `SMTP_USER`/`SMTP_PASSWORD`. `SMTP_USER`/`SMTP_PASSWORD` are **required**
> for Resend (Mailpit accepts any/no auth, so they may be empty there only).
| `THROTTLE_TTL` | yes | Rate-limit window in **seconds**, e.g. `60` |
| `THROTTLE_LIMIT` | yes | Max requests per window, e.g. `10` |

## Secrets

Inject `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, and the
`SMTP_*` credentials at runtime via environment variables from your platform's
secret manager. **Never** bake secrets into the image or commit them. The local
`.env` is git-ignored and excluded from the build context by `.dockerignore`, so
it never enters the image.

## Resend setup (one-time)

Production email is sent through **Resend** from `Pollendar
<pollendar@heymanuel.ch>`. Resend authenticates the whole sending domain, so the
domain `heymanuel.ch` must be **Verified** in Resend before the first live send.
Perform this once, in the Resend dashboard plus the `heymanuel.ch` DNS provider:

1. **Add the domain.** Resend dashboard → **Domains → Add Domain → `heymanuel.ch`**.
2. **Add the DNS records Resend shows** at the `heymanuel.ch` DNS provider. Copy
   the names/values **verbatim** from the dashboard (the selector and key tokens
   are generated per-domain — never hand-author DKIM/SPF values):
   - **MX** on the bounce/return-path subdomain (e.g. `send.heymanuel.ch`) →
     value `feedback-smtp.<region>.amazonses.com`, priority `10`.
   - **TXT (SPF)** on that same subdomain → `"v=spf1 include:amazonses.com ~all"`.
     If the apex already has an SPF record, **merge** the include into the single
     existing record — never create a second SPF `TXT` (multiple SPF records are invalid).
   - **TXT (DKIM)** → name `resend._domainkey` (or as Resend specifies) → the long
     DKIM public-key value Resend provides.
   - Optionally the **TXT (DMARC)** Resend recommends on `_dmarc.heymanuel.ch`
     (start permissive, e.g. `v=DMARC1; p=none;`, and tighten later).
3. **Verify.** Back in Resend, click **Verify** and wait until the domain status
   reads **Verified** (DNS propagation can take minutes to hours).
4. **Create the API key.** **API Keys → Create API Key** with **Sending**
   permission, scoped to `heymanuel.ch` if offered. Copy the `re_...` key **once**
   (it is shown only at creation) — this is the value for `SMTP_PASSWORD`. Store it
   in the production secret manager; never commit it.
5. **Confirm the sender.** `pollendar@heymanuel.ch` falls under the verified
   `heymanuel.ch` domain, so any `@heymanuel.ch` From address works once the domain
   is Verified.

## Verify a real send

After the domain reads **Verified** and the `re_...` key is in the secret manager,
confirm one real magic-link delivery end-to-end:

1. Provide the production Resend values to the API **at runtime only** (never
   committed) — e.g. a host-only `.env.prod` consumed via `docker run --env-file`:

   ```
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=resend
   SMTP_PASSWORD=re_xxxxxxxx        # the pollendar-prod-smtp Resend API key
   MAIL_FROM="Pollendar <pollendar@heymanuel.ch>"
   ```

2. Boot the API and request a magic link for a **real** recipient inbox:

   ```bash
   curl -fsS -X POST "$APP_URL/api/auth/magic-link" \
     -H 'Content-Type: application/json' \
     -d '{"email":"you@your-real-inbox.example"}'
   # → 200 { "ok": true }  (always 200 — anti-enumeration)
   ```

3. Confirm the email arrives in that inbox **From `Pollendar
   <pollendar@heymanuel.ch>`**, and that the Resend dashboard → **Logs** shows the
   message as **Delivered**.

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
