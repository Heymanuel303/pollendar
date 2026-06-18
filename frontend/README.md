# Pollendar frontend (Vue 3 + Vite + Tailwind v4)

The "Dusk Calendar" SPA for Pollendar — sign in by magic link, build an availability poll, share it,
collect tri-state responses, and watch the best ("in bloom") slot emerge. Vue 3.5 + Vite +
TypeScript (strict) + Pinia + vue-router, styled with Tailwind v4 (CSS-first, no `tailwind.config.js`).

## Prerequisites

- Node `^22.18.0 || >=24.12.0`.
- The backend stack running for anything beyond static UI work:
  - docker-compose (MySQL + Mailpit) up — `docker compose up -d` from the repo root.
  - The NestJS API on `:3000` (`/api`), migrated and seeded.
  - Mailpit web UI / API on `:8025` (dev emails — magic links, completion notices — land here).

## Environment

Vite reads `VITE_`-prefixed vars from `.env`. Copy the example and adjust if needed:

```bash
cp .env.example .env
```

| Var             | Dev default              | Purpose                                                        |
| --------------- | ------------------------ | ------------------------------------------------------------- |
| `VITE_API_BASE` | `/api`                   | API base. `/api` is proxied to the backend by the dev server (`vite.config.ts`) so the auth cookie stays **same-origin** — no CORS in dev. |
| `VITE_APP_URL`  | `http://localhost:5173`  | Public origin of this SPA; used to build share / invite links (never hard-coded). |

`.env*` is gitignored except `.env.example`. For production, create a `.env.production` that points
at the prod origins (see **Production notes** below) — Vite bakes those values into `dist/` at build time.

## Run

```bash
npm install
npm run dev          # Vite dev server on :5173 (binds --host; /api proxied to the backend)
```

## Build

```bash
npm run build        # vue-tsc --build (type-check) + vite build → dist/
npm run preview      # serve the production build locally
```

## Lint / format / unit tests

```bash
npm run lint         # oxlint + eslint
npm run format       # prettier (src/)
npm run test:unit    # vitest component/store unit tests
```

## End-to-end tests (Playwright)

`e2e/happy-path.spec.ts` drives the full flow against the **live** backend: sign in via the Mailpit
magic link → create a poll → share → vote in a second browser context → watch the best slot bloom →
complete → assert the completion email in Mailpit.

Prerequisites (all running before you start):

- docker-compose (MySQL + Mailpit on `:8025`).
- The NestJS backend on `:3000/api`, migrated/seeded, with `CORS_ORIGINS` including this SPA's origin.

```bash
npx playwright install chromium   # one-time browser download
npm run test:e2e                  # headless run (boots the dev server via webServer)
npm run test:e2e:ui               # interactive UI mode
```

Notes:

- The spec uses a unique throwaway email per run (`creator-<ts>@example.test`) to avoid the
  `@@unique([pollId, email])` participant conflict and stay under the magic-link rate limit (5/60s).
- Mailpit base URL is configurable via `MAILPIT_URL` (default `http://localhost:8025`).
- The invalid/expired magic-link branch (`/auth/callback` with a stale token → "This link has
  expired or was already used.") is intentionally **not** part of the happy path.

## Production notes — cookies & CORS

Auth is cookie-based: `/api/auth/verify` sets **httpOnly** access + refresh cookies and the SPA never
reads the JWT. Every request uses `credentials: "include"`. For that to work in production:

**Backend env:**

- `CORS_ORIGINS` — comma-separated allow-list that **must include the SPA's exact prod origin**
  (e.g. `https://pollendar.example`). The API calls `app.enableCors({ origin: <list>, credentials: true })`;
  a wildcard `*` is not allowed with credentials, so the origin must be listed explicitly.
- `COOKIE_SECURE=true` — cookies are only sent over HTTPS in prod.
- `COOKIE_DOMAIN` — set to the real registrable domain (e.g. `pollendar.example`), **not** `localhost`
  and not a bare IP (IP literals are invalid per RFC 6265; leave empty for host-only on a LAN IP).
- `APP_URL` — the SPA origin; the backend builds share links and the magic-link callback URL from it.

**Cookie `SameSite`:**

- If the SPA and API share a registrable domain (e.g. `pollendar.example` + `api.pollendar.example`),
  `SameSite=Lax` works and is the default.
- If they are split across different sites, cookies must be `SameSite=None; Secure` (and both ends must
  be HTTPS) for the browser to send them cross-site.

**Frontend env (`.env.production`):**

- `VITE_API_BASE=https://api.pollendar.example/api`
- `VITE_APP_URL=https://pollendar.example`

> Boot-time validation of the prod env vars is handled by the backend's env validation
> (PLAN.md Phase 8 hardening), not this SPA.
