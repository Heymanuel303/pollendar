# backend (NestJS + Prisma)

Pollendar's API server — NestJS 11 + Prisma 6 against PostgreSQL 16. Scaffolded in
**Phase 0/1** — see [`../docs/PLAN.md`](../docs/PLAN.md) for the roadmap and
[`../docs/DESIGN.md`](../docs/DESIGN.md) for the architecture, 3NF schema, and module layout.

## Local development

Infra (PostgreSQL + Mailpit) comes from the repo-root `docker-compose.yml`, and config is read
from the **repo-root `.env`** via `@nestjs/config` (validated on boot — the app fails fast on
a missing/invalid required var).

```bash
# from repo root: cp .env.example .env && docker compose up -d
cd backend
npx prisma migrate dev     # apply migrations (Phase 1+)
npm run start:dev          # http://localhost:3000/api
```

- **Emails** (magic links, results) land in Mailpit at http://localhost:8025 in dev.
- **Inspect data:** `npx prisma studio`.
- **Reset DB:** `npx prisma migrate reset` (re-runs migrations + seed).

## Tests

```bash
npm test          # unit specs (Jest)
npm run test:e2e  # end-to-end specs
```

## Production / Deploy

See [`../docs/DEPLOY.md`](../docs/DEPLOY.md) for the full production deploy guide
(image build, run order, required env, and the security checklist). In short: the
image is built from `backend/` (`docker build -t pollendar-api:<tag> ./backend`),
and on container start the entrypoint runs `prisma migrate deploy` before serving
the API.

Production outbound email uses **Resend SMTP** — an env-only switch from the dev
Mailpit relay (same `MailService`, same `SMTP_*` vars, no code change). See
[`../docs/DEPLOY.md`](../docs/DEPLOY.md) for the Resend env table and the one-time
domain setup.
