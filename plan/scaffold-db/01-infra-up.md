---
phase: 1
title: Infra up
plan: scaffold-db
status: done
depends_on: []
execution: solo
---

## Goal
Bring up local infrastructure so later phases can migrate and seed: create `.env` from the
template and start the Docker stack (MySQL 8.4 + Mailpit), verifying both are healthy.

## Context & files
- Read: `docker-compose.yml` (services `mysql` → `:3306`, `mailpit` → `:1025`/`:8025`),
  `.env.example` (DATABASE_URL + MYSQL_* + SMTP_*), `docs/PLAN.md` §3 (infra) / §6.
- Create: `.env` at repo root (gitignored copy of `.env.example`).
- No application code in this phase.

## Steps
1. From repo root, copy the env template only if absent: `cp -n .env.example .env`.
2. Confirm `DATABASE_URL=mysql://pollendar:pollendar@localhost:3306/pollendar` and the
   `MYSQL_*` values in `.env` agree with `docker-compose.yml` defaults.
3. `docker compose up -d`.
4. Wait until MySQL reports healthy: poll `docker compose ps` (container `pollendar-mysql`).
5. Confirm Mailpit UI responds at `http://localhost:8025`.

## Tests
No test runner exists yet (it arrives with the NestJS scaffold in Phase 2). Verification is
via smoke commands, which double as the acceptance check:
- `docker compose ps` → both services `Up`/`healthy`.
- `docker compose exec mysql mysqladmin ping -h localhost -uroot -p"$MYSQL_ROOT_PASSWORD"`
  → `mysqld is alive`.
- `curl -fsS -o /dev/null -w '%{http_code}' http://localhost:8025` → `200`.

## Acceptance criteria
- [x] `.env` exists (copied from `.env.example`) and is not tracked by git.
- [x] `docker compose ps` shows `mysql` and `mailpit` running/healthy.
- [x] MySQL answers `mysqladmin ping` on `:3306`.
- [x] Mailpit UI returns HTTP 200 at `http://localhost:8025`.

## Out of scope
Application code, Prisma init, migrations (Phase 3), seed (Phase 4), frontend.
