---
description: Execute a single phase from a Pollendar plan in docs/plans/ (NestJS 11 / Prisma 7 / MySQL 8.4). Reads the phase file cold, runs it solo or as a workflow per the phase's Execution field, verifies, writes tests (via /test), and hands back a dirty tree.
model: opus
---

Execute one phase of a plan. Invoked like:

```
/execute phase 1 from docs/plans/{YYYY-MM-DD}-{feature}/00-overview.md
/execute phase 2 from @docs/plans/2026-06-09-some-feature/00-overview.md
/execute 3 docs/plans/{YYYY-MM-DD}-{feature}/00-overview.md
```

`$ARGUMENTS` carries the phase number and the overview path. Parse both.

Plan folders are dated: `docs/plans/{YYYY-MM-DD}-{feature-name}/` (e.g. `docs/plans/2026-06-09-some-feature/`), so a sorted listing runs oldest→newest. The `{feature}` placeholder below resolves to that full dated folder name. (Example already in-repo: `docs/plans/scaffold-db/`.)

## Resolve inputs

1. **Phase number** — first integer in `$ARGUMENTS`.
2. **Overview path** — first path matching `docs/plans/*/00-overview.md` (strip a leading `@` if present). If `$ARGUMENTS` names no overview, list `docs/plans/*/00-overview.md` and take the **chronologically-last** match — dated folders sort by date, so the last entry is the newest plan; prefer that over modified-time heuristics.
3. **Phase file** — read the overview, find the link for phase N, resolve relative to the overview's folder. Fallback: `docs/plans/{feature}/{NN}-*.md` where `{feature}` is the dated folder name and `NN` is the zero-padded phase number.

If either input is missing or ambiguous (no phase number, overview not found, phase file not found) → stop and ask the user with `AskUserQuestion`. Do NOT guess.

State what you resolved in one line before starting:
`Executing phase {N}: {phase title} — {phase-file-path}`

## Read the phase cold

This session is fresh by design. Read **only**:

- The phase file itself (full content).
- Files explicitly listed under "Files to touch" in the phase.
- Adjacent files needed to understand those (imports, callers) — pull as you go.

Do NOT read other phase files. Do NOT read the overview beyond resolving the phase link. The phase is self-contained by contract; if it isn't, surface that as a blocker rather than papering over it.

### Pollendar toolchain (the concrete defaults)

This is a monorepo with **NO root package.json**. Repo root = `/home/emmanuel/projects/pollendar`. The only real application code today is in `backend/` (a NestJS 11 / Prisma 7 API). `frontend/` is PLANNED Vue 3 but NOT yet scaffolded (empty except a README — no package.json, no commands). Skip the frontend entirely until it exists.

**All backend commands run FROM the `backend/` directory.** Bake these exact values as the defaults:

- **Lint:** `npm run lint` (= `eslint "{src,apps,libs,test}/**/*.ts" --fix`)
- **Format (write):** `npm run format` (= `prettier --write "src/**/*.ts" "test/**/*.ts"`). There is NO format-check script; a check is `npx prettier --check "src/**/*.ts" "test/**/*.ts"`.
- **Unit tests:** `npm test` (= `jest`; rootDir=`src`, testRegex `.*\.spec\.ts$` — unit specs live next to source as `*.spec.ts` under `backend/src/`).
- **E2E tests:** `npm run test:e2e` (= `jest --config ./test/jest-e2e.json`; specs under `backend/test/`).
- **Coverage:** `npm run test:cov` (= `jest --coverage`).
- **Build:** `npm run build` (= `nest build`).
- **Dev server:** `npm run start:dev` (= `nest start --watch`; serves http://localhost:3000/api).
- **Prisma / codegen (from `backend/`):** `npx prisma generate`, `npx prisma migrate dev --name <name>`, `npx prisma migrate reset` (re-runs migrations + seed), `npx prisma studio` (inspect data). Seed = `tsx prisma/seed.ts`, wired in `backend/prisma.config.ts` under `migrations.seed` (Prisma 7 reads the seed from `prisma.config.ts`, NOT package.json).

Local infra is `docker-compose.yml` at repo root: MySQL 8.4 (localhost:3306, db `pollendar`) + Mailpit (SMTP localhost:1025, web UI http://localhost:8025). Bring up with `docker compose up -d` if a phase needs the DB or email.

Env is single-sourced at **repo-root `.env`** (copy from `.env.example`). Both the NestJS app (`@nestjs/config`, validated on boot) and the Prisma CLI (via `backend/prisma.config.ts`) read it. NEVER duplicate secrets under `backend/`.

**Prisma 7 gotchas (load-bearing — respect when touching the data layer):**
- `schema.prisma` MUST NOT contain `url`. The connection string is supplied by `backend/prisma.config.ts` (which loads repo-root `.env` and passes `DATABASE_URL`).
- `PrismaService` connects via a DRIVER ADAPTER using `@prisma/adapter-mariadb` + `mariadb`.
- The schema uses the CLASSIC generator (`provider = "prisma-client-js"`), NOT the ESM `prisma-client` generator (the ESM one uses `import.meta` and breaks the CommonJS ts-jest / nest-build toolchain).
- `migrate dev` needs a grant on the shadow database.

If any of these commands change, re-discover from `backend/package.json` and `backend/prisma.config.ts` — lead with the concrete values above but don't trust them blindly if the repo has drifted.

### Pollendar layers (the project's actual structure)

The phase's "Files to touch" tells you where to work; these are the named layers it draws from:

- **DATA layer** — `backend/prisma/`: `schema.prisma`, migrations under `backend/prisma/migrations/`, `seed.ts`, plus `backend/src/prisma/` (`PrismaModule` + `PrismaService`, global DI). EXISTS. Tables: users, login_tokens, auth_sessions, polls, poll_dates, poll_slots, participants, responses, slot_tallies, email_log. Enums: PollStatus, Availability, EmailType, EmailStatus.
- **SERVICE / API layer** — NestJS modules/controllers/services under `backend/src/`. Exists: `prisma/`, `config/`. PLANNED (not yet created — create per the phase): `auth/` (magic link, sessions, guards), `polls/` (CRUD, complete, invite message), `public/` (public poll fetch + response submit), `responses/` (tally / best-slot computation), `notifications/` (mailer + completion emails).
- **CONFIG / INFRA layer** — `backend/src/config/` (env validation, `env.validation.ts`, fails fast on missing/invalid required vars), `docker-compose.yml`, repo-root `.env`. EXISTS.
- **FRONTEND layer** — PLANNED Vue 3 app, NOT yet scaffolded. Do NOT touch or invent frontend commands until it exists.

There is no shared/packages module today. No external observability (no Sentry) — dev signal = nest app logs, Mailpit UI (http://localhost:8025) for emails, `npx prisma studio` / `mysql` CLI against localhost:3306 for data.

Follow the project's existing conventions (DTOs with class-validator/class-transformer, module/service/controller layering, naming) — discover them from neighboring code under `backend/src/`, don't impose new ones.

## Choose execution mode

Read the phase's `**Execution:**` field:

- **`solo`** (or field absent) → run it yourself in this session: **Execute (solo)** below.
- **`workflow`** → the planner judged this phase worth fanning out. Run it via the `Workflow` tool following the phase's **## Execution strategy** section: **Execute (workflow)** below.

State which mode you're using in one line before starting.

## Execute (solo)

1. **Plan tasks.** Use `TaskCreate` to mirror the phase's "Steps" list. Mark each `in_progress` / `completed` as you go.
2. **Implement.** Edit files using `Edit` / `Write`. Stay within the phase's stated scope. If the phase says "do X in file Y" and you discover Y also needs Z to compile, do Z — but flag scope creep in the final report. Follow the project's existing conventions (discover them from neighboring code under `backend/src/`).
3. **Verify.** Run the commands under the phase's "Verification" section, from `backend/`. Typically:
   - `npm run lint`
   - `npx prisma format` is NOT used; format via `npm run format` (or check with `npx prettier --check "src/**/*.ts" "test/**/*.ts"`)
   - `npm test` (and `npm run test:e2e` if the phase touched e2e-covered flows)
   - `npm run build`
   - `npx prisma generate` if `schema.prisma` was touched (regenerate the client); `npx prisma migrate dev --name <name>` if the phase adds a migration
   Fix failures before committing. Don't suppress lints to make verification pass.
4. **Check acceptance.** Walk the phase's "Acceptance" checklist. If a box can't be checked, stop and report — don't hand back a half-done phase.

## Execute (workflow)

The phase is marked `**Execution:** workflow`. Author **one** `Workflow` call inline that follows the phase's **## Execution strategy** section verbatim — it tells you the fan-out unit, shape, isolation, and verify stage. You own correctness; the workflow is your fan-out, not an excuse to skip the cold read.

1. **Pre-flight (in this session).** Cold-read the phase + its "Files to touch". If "Execution strategy" says edit sites must be discovered first, find them now (grep/Explore) so you can hand the workflow a concrete work-list — don't make the workflow guess scope.
2. **Author the script.** Translate "Execution strategy" into the script:
   - **Shape:** `pipeline(items, transform, verify)` for independent edit-sites/files (the default — each item flows transform→verify without a barrier). `parallel(...)` only when a stage genuinely needs all prior results together (cross-file dedup, all-or-nothing gate). `find → transform → verify` when sites were discovered in pre-flight.
   - **Fan-out unit:** one agent per file / call-site / NestJS module / layer / dimension, as the section states.
   - **Isolation:** `isolation: 'worktree'` ONLY if agents would edit the **same** file concurrently. If each agent owns a distinct file, omit it — they edit the shared tree without conflict (cheaper, no merge step).
   - **Cold prompts:** each agent starts fresh — embed the exact file path, the precise change, and the pattern to follow as string literals. Reference no conversation context. Tell each editor to stay strictly within its assigned file/scope and leave changes uncommitted.
   - **Verify stage:** have each item's verifier confirm its edit compiles/matches intent; for high-assurance phases, make verifiers adversarial (try to refute the edit) and use a `schema` so verdicts are structured.
3. **Run it**, then **reconcile in this session:** review the diff the workflow produced, run the phase's full "Verification" commands yourself from `backend/` (`npm run lint`, `npm test`, `npm run build`, plus `npx prisma generate`/`migrate dev` if the schema changed) against the merged tree, and fix any cross-file breakage the per-item agents couldn't see. A green per-item verifier is not a green phase — you own the whole-tree verification.
4. **Check acceptance** exactly as in solo mode. If a box can't be checked, stop and report.

If mid-run the workflow reveals the phase's scope was wrong (sites that don't exist, a shape that doesn't fit), stop and surface it as a blocker — don't let the workflow paper over a bad phase.

## Write tests

Once verification is green and acceptance is met, cover the phase's changes with tests by running the `/test` command scoped to this phase:

1. **Scope to the phase.** Test only the behavior this phase introduced — the files under "Files to touch" and the new/changed services, controllers, modules, or functions. Don't backfill unrelated coverage.
2. **Write tests** following the `/test` command's rules: unit specs as `*.spec.ts` next to the source under `backend/src/` (Jest, ts-jest); e2e specs under `backend/test/` if the phase introduced an HTTP flow. Cover the contract not the implementation, one group per subject, arrange-act-assert. Run `npx prisma generate` first if the phase changed `schema.prisma`.
3. **Run tests in an isolated subagent** exactly as the `/test` command describes — delegate execution to a single `Agent` call (`subagent_type: "general-purpose"`) so output stays out of main context. Brief it self-contained: run `npm test` (and `npm run test:e2e` if relevant) from `backend/`.
4. **Fix failures** per the `/test` command: test wrong → fix the test; code wrong (regression in this phase's scope) → fix the code. No skipped tests, no loosened asserts, no swallowed errors. Rerun fix → test until green or 3 cycles, then stop and ask.

If nothing testable changed (pure docs/config/generated code) → say so and skip. Don't fabricate tests.

## Hand off

When verification is green and acceptance is met, stop. Leave changes uncommitted in the working tree — the user commits manually at the end of their session.

Do NOT commit. Do NOT push. Do NOT open a PR. Do NOT start the next phase — that's a separate `/execute` invocation in a fresh session.

(For context when the user does commit: protected branch is `main` — branch before committing if on main. Commit style is Conventional Commits WITH a scope, lower-case, scope = the plan/feature slug, e.g. `feat(scaffold-db): add deterministic Prisma seed`. No co-author trailers, no fluff.)

## Schema/migration safety

Pollendar's DB schema is consumed ONLY by the in-repo NestJS API — it does NOT deploy independently of any client (no mobile app, no external versioned consumers, no force-update mechanism). So there is NO expand→contract / version-floor migration contract to honor here; do NOT impose one.

Keep migrations light and concrete: they live under `backend/prisma/migrations/`, applied with `npx prisma migrate dev --name <name>` from `backend/`, reset with `npx prisma migrate reset` (which also re-runs the seed). Inspect the result with `npx prisma studio` or the `mysql` CLI against localhost:3306 (db `pollendar`); inspect dev emails in Mailpit at http://localhost:8025. Respect the Prisma 7 gotchas above (no `url` in schema; driver adapter; classic generator; shadow-DB grant for `migrate dev`).

## Blockers

Stop and ask the user if:

- Phase file references something that doesn't exist (file, NestJS module, package, migration, table).
- "Files to touch" conflicts with current repo state in a way the phase didn't anticipate.
- Verification fails for a reason outside the phase's scope.
- Acceptance criteria are ambiguous given the code you see.
- A phase assumes the frontend exists (it is not scaffolded) — surface that rather than inventing frontend commands.

Don't silently expand scope to fix upstream problems — surface them.

## Report

End-of-turn summary (1–3 sentences):
- What landed (files touched + one-line scope).
- Tests added (count + files) and final test status.
- Anything skipped or flagged for the next phase.
- Next phase to run, if any (just the pointer — don't auto-trigger).

## Rules

- **Cold read.** Treat the phase file as the spec. Don't lean on conversation context the planner had.
- **Single phase only.** No "while I'm here" work from other phases.
- **No commit, no push, no PR.** Hand back a dirty working tree; user commits manually.
- **No edits outside the phase scope** except minimum-needed compile fixes — and flag them.
- **Don't rewrite the plan.** If the phase is wrong, report it; user decides whether to revise the plan or push through.
- **Tests are part of the phase.** A phase isn't done until its changes are covered by tests (via the `/test` command) and green — unless nothing testable changed.

## Output style

- Brief. No preamble, no recap, no chatter.
- Bullet points over prose.
- Lead with the answer; cut everything that isn't actionable.
- Questions (if any): one line each, batched in a single `AskUserQuestion`.
- No closing summary beyond the 1–3 sentence "Report" step.
