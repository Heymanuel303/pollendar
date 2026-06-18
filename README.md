# Pollendar

A small web app for finding the best date & time for a group — like Doodle / When2Meet.

A **creator** signs in with a passwordless magic link, builds a poll (title, short
description, candidate dates, and time slots within those dates), and shares a public
link. **Participants** open the link, mark their availability against each slot, and
optionally leave a name and email. The best date/slot is recomputed on every submission.
When the creator confirms the final slot, a notification email is sent **only** to
participants who supplied an email — no emails, no messages.

## Status

🟡 **Design phase.** This repository currently contains the design and the implementation
plan only. No application code has been generated yet — see the docs below and review them
before scaffolding begins.

- [`docs/DESIGN.md`](docs/DESIGN.md) — architecture, the 3NF MySQL schema, the Prisma
  schema, the best-date algorithm, the REST API, auth & notification flows, and the
  frontend information architecture.
- [`docs/PLAN.md`](docs/PLAN.md) — pinned stack versions, the folder layout, the exact
  scaffolding commands, the phased implementation roadmap, and how to run it locally.

## Stack (summary)

| Layer        | Choice                                                       |
| ------------ | ------------------------------------------------------------ |
| Database     | MySQL 8.4 (Docker Compose)                                   |
| Backend      | NestJS 11 (TypeScript) + Prisma 6                            |
| Frontend     | Vue 3 + Vite + Pinia + vue-router                            |
| Styling      | Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first)             |
| Auth         | Passwordless magic link (email → signed, single-use link)    |
| Email (dev)  | Mailpit (catch-all SMTP, web UI at http://localhost:8025)    |
| Email (prod) | Resend SMTP via the same `SMTP_*` vars, From `Pollendar <pollendar@heymanuel.ch>` — env-driven switch, no code change (see [`docs/DEPLOY.md`](docs/DEPLOY.md)) |

## Layout

```
pollendar/
├── docker-compose.yml     # MySQL 8.4 + Mailpit
├── .env.example           # all environment variables
├── docs/                  # DESIGN.md + PLAN.md  ← review these
├── backend/               # NestJS app (generated in Phase 0)
└── frontend/              # Vue + Vite app (generated in Phase 0)
```

## Next step

Review `docs/DESIGN.md` and `docs/PLAN.md`. Once approved, Phase 0 (scaffold & infra)
brings the `backend/` and `frontend/` apps to life.
