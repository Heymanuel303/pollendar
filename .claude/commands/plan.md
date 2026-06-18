---
description: Write a detailed multi-phase implementation plan for Pollendar (NestJS 11 / Prisma 7 / MySQL 8.4) to docs/plans/{date}-{feature-name}/ based on the current conversation. A single workflow explores the repo and drafts every phase in parallel; each phase records whether /execute should run it solo or as a workflow.
model: opus
---

Generate a durable, executable plan from the in-flight conversation. Output goes to `docs/plans/{date}-{feature-name}/` (date-prefixed so `ls docs/plans/` sorts chronologically oldest→newest). Each phase file must stand alone — a fresh Claude session reading only that file plus the repo should be able to finish it end-to-end.

You orchestrate. A **single workflow** (the `Workflow` tool) does the heavy lifting: it fans out read-only explorers over the repo, then drafts every phase file in parallel from real paths/APIs. You confirm inputs, decide the phase list + per-phase execution strategy, run the workflow, then write the overview and stitch everything together.

## Project facts (baked in — re-discover only if the repo has drifted)

Pollendar is a monorepo with **no root package.json**; the repo root is `/home/emmanuel/projects/pollendar`. Backend application code is the only real code today. Authoritative project docs: `docs/DESIGN.md` (architecture, 3NF schema, best-date algorithm, REST API, auth/notification flows) and `docs/PLAN.md` (pinned stack, folder layout, phased roadmap). Read these for context; they are the source of truth for scope decisions.

**Layers** (use these as the explorer fan-out units and Scope vocabulary):
- **DATA** — Prisma schema + migrations + `PrismaService` + seed, under `backend/prisma/` and `backend/src/prisma/`. EXISTS.
- **SERVICE/API** — NestJS 11 modules/controllers/services under `backend/src/`. Existing: `prisma/`, `config/`. Planned (per `docs/PLAN.md`, not yet created): `auth/` (magic link, sessions, guards), `polls/` (CRUD, complete, invite), `public/` (public poll fetch + response submit), `responses/` (tally / best-slot), `notifications/` (mailer + completion emails).
- **CONFIG/INFRA** — `backend/src/config/` env validation (`env.validation.ts`, fails fast on missing/invalid required var), `docker-compose.yml`, repo-root `.env`.
- **FRONTEND** — planned Vue 3.5 app under `frontend/`. NOT yet scaffolded (empty except a README, no package.json). **Skip the frontend entirely** — do not invent Vue/Vite/vitest commands or phases until it is actually scaffolded.

**Exact commands — backend commands RUN FROM the `backend/` directory** (defined in `backend/package.json`). If these change, re-discover from `backend/package.json`:
- Lint: `npm run lint` (eslint with `--fix`)
- Format check: `npx prettier --check "src/**/*.ts" "test/**/*.ts"` (there is no dedicated format-check script; `npm run format` writes)
- Unit tests: `npm test` (jest; specs live next to source as `*.spec.ts` under `backend/src/`)
- E2E tests: `npm run test:e2e` (specs under `backend/test/`)
- Coverage: `npm run test:cov`
- Build: `npm run build` (nest build)
- Dev server: `npm run start:dev` (serves `http://localhost:3000/api`)
- Prisma / DB (from `backend/`): `npx prisma generate`, `npx prisma migrate dev --name <name>`, `npx prisma migrate reset` (re-runs migrations + seed), `npx prisma studio`. Seed runs `tsx prisma/seed.ts`, wired in `backend/prisma.config.ts` under `migrations.seed`.

**Prisma 7 gotchas (load-bearing — bake into any DATA-layer phase):**
- `schema.prisma` must NOT contain `url` — the connection string comes from `backend/prisma.config.ts`, which loads the repo-root `.env` and passes `DATABASE_URL`.
- `PrismaService` connects via a DRIVER ADAPTER using `@prisma/adapter-mariadb` + `mariadb`.
- The schema uses the CLASSIC generator (`provider = "prisma-client-js"`), NOT the ESM `prisma-client` generator (the ESM one uses `import.meta` and breaks the CommonJS ts-jest / nest-build toolchain).
- The Prisma shadow database needs a grant for `migrate dev` to work.
- Seed is read from `prisma.config.ts`, not `package.json`.

**Data model** (3NF, `backend/prisma/schema.prisma`) — tables: `users`, `login_tokens`, `auth_sessions`, `polls`, `poll_dates`, `poll_slots`, `participants`, `responses`, `slot_tallies`, `email_log`. Enums: `PollStatus`, `Availability`, `EmailType`, `EmailStatus`.

**Guardrails:**
- Env is single-sourced at repo-root `.env` (copy from `.env.example`). NEVER duplicate secrets under `backend/`. Both `@nestjs/config` (validated on boot) and the Prisma CLI read this one file.
- Protected branch: `main` (also the PR base). Branch before committing if on main.
- Commit style: Conventional Commits WITH a lower-case scope (usually the plan/feature slug), e.g. `feat(scaffold-db): add deterministic Prisma seed`. No co-author trailers, no fluff.
- Auth is passwordless magic link (email → signed single-use link) with JWT sessions; email goes via nodemailer → Mailpit in dev.

**Observability / inspection:** none configured (no Sentry / external error tracking). Dev signal sources only: nest app logs, Mailpit web UI (`http://localhost:8025`) for emails, `npx prisma studio` or the `mysql` CLI against `localhost:3306` (db `pollendar`) for data. Use these in Verification sections — do not reference any external observability tool.

## Inputs to confirm before writing

Pull from conversation history first. If any of these are missing or ambiguous, ask the user with `AskUserQuestion` before running the workflow. Do not invent.

- **Feature name** — kebab-case descriptive slug; the on-disk folder name is `{date}-{feature-name}`
- **Goal / problem statement** — what changes when this lands
- **Scope** — which layers/modules are touched (DATA / SERVICE-API module / CONFIG-INFRA)
- **Out of scope** — explicit non-goals
- **Constraints** — perf, schema, backwards-compat, deadlines
- **Acceptance criteria** — observable done-signals
- **Phase breakdown** — if user already sketched one; otherwise propose

Ask only what's actually unclear. One round of questions max, then proceed.

## Folder layout

```
docs/plans/{date}-{feature-name}/
  00-overview.md
  01-{phase-slug}.md
  02-{phase-slug}.md
  ...
```

First capture today's date in the main session with `date +%F` (this gives `{date}` as `YYYY-MM-DD` — the workflow script can't compute it, see below), then form the folder name `docs/plans/{date}-{feature-name}` and `mkdir -p docs/plans/{date}-{feature-name}`.

## Decide the phase list AND each phase's execution strategy

Before running the workflow, draft the ordered phase list (slug + one-line objective each, using the sizing heuristics below). For **each phase**, also decide how `/execute` should later run it — this gets baked into the phase file as `**Execution:** solo` or `**Execution:** workflow`:

- **`solo`** — a focused change a single fresh `/execute` session can finish directly. Default. Use when the phase touches a handful of files in one area (one NestJS module + its spec, a migration + its consuming service, a contained refactor).
- **`workflow`** — the phase has broad, parallelizable, or high-assurance surface that benefits from fan-out. Use when ANY of:
  - **Wide independent sweep** — the same mechanical change across many files/call-sites (rename of a widely-used symbol, codemod-style edits).
  - **Multi-layer in one phase** — independent work across the project's layers (e.g. DATA migration + SERVICE/API module + CONFIG) that can proceed in parallel.
  - **High-assurance** — security-sensitive (auth magic-link / JWT / session paths), schema/migration correctness, or other paths where adversarial verification of the result is worth the spend.
  - **Discovery-then-act** — the exact set of edit sites isn't known until the repo is searched (find all usages → transform each).

  A `workflow` phase MUST include an `## Execution strategy` section (template below) telling `/execute` what to fan out, what to verify, and whether worktree isolation is needed.

When unsure, prefer `solo` — workflows cost tokens; only mark `workflow` when the fan-out clearly pays for itself.

## Run the planning workflow

Author **one** `Workflow` call inline. It runs two phases: `Explore` (read-only fan-out, one explorer per planned phase) then `Draft` (one writer per planned phase, fed its explorer's findings). The workflow agents start cold — interpolate every confirmed input into the script as string literals; never write "see conversation".

The script **cannot** call `Date.now()` / `new Date()` (they throw in workflow scripts). Interpolate the `date +%F` value you captured earlier as a literal when authoring the script — bake it into the `FEATURE` constant so the folder carries the date prefix. Do not compute the date inside the script.

Use this script template, filling the placeholders from the confirmed inputs and your phase list:

```js
export const meta = {
  name: 'plan-{feature-name}',
  description: 'Explore the repo and draft phase files for {feature-name}',
  phases: [
    { title: 'Explore', detail: 'read-only sweep of each phase\'s touched area' },
    { title: 'Draft', detail: 'one writer per phase' },
  ],
}

const FEATURE = '{date}-{feature-name}'  // date from `date +%F`, interpolated as a literal — NEVER new Date() here
const GOAL = '{1-sentence goal}'
const SCOPE = '{layers/modules touched — DATA / SERVICE-API / CONFIG-INFRA}'
const CONSTRAINTS = '{perf / schema / compat / deadline}'

// One entry per planned phase. exec is the strategy you decided above.
const PHASES = [
  { n: 1, slug: '{slug}', objective: '{one sentence}', dependsOn: 'none',          exec: 'solo' },
  { n: 2, slug: '{slug}', objective: '{one sentence}', dependsOn: '01-{slug}.md',  exec: 'workflow' },
  // ...
]

const EXPLORE_SCHEMA = {
  type: 'object',
  required: ['files', 'apis', 'patterns', 'gotchas'],
  properties: {
    files:    { type: 'array', items: { type: 'string' } },  // real paths to touch
    apis:     { type: 'array', items: { type: 'string' } },  // real signatures/symbols involved
    patterns: { type: 'array', items: { type: 'string' } },  // existing conventions to follow
    gotchas:  { type: 'array', items: { type: 'string' } },  // risks, edge cases, ordering constraints
  },
}

const pad = n => String(n).padStart(2, '0')

phase('Explore')
const findings = await parallel(PHASES.map(p => () =>
  agent(
    `Read-only exploration for phase ${p.n} of "${FEATURE}".\n` +
    `Feature goal: ${GOAL}\nScope: ${SCOPE}\nThis phase's objective: ${p.objective}\n\n` +
    `This is the Pollendar monorepo (no root package.json; backend code under backend/, NestJS 11 + Prisma 7 + MySQL 8.4). ` +
    `Read docs/DESIGN.md and docs/PLAN.md for context. ` +
    `Find the REAL files this phase must touch (exact paths), the actual APIs/signatures/symbols involved, ` +
    `existing patterns to mirror, and any gotchas or ordering constraints. Return concrete paths and symbols — no guesses.`,
    { label: `explore:${p.slug}`, phase: 'Explore', agentType: 'Explore', schema: EXPLORE_SCHEMA }
  )))

phase('Draft')
const drafts = await parallel(PHASES.map((p, i) => () =>
  agent(draftPrompt(p, findings[i]), { label: `draft:${p.slug}`, phase: 'Draft' })))

return { drafts }

// draftPrompt embeds the phase-file template (below) + the explorer's findings, and
// instructs the writer to Write docs/plans/${FEATURE}/${pad(p.n)}-${p.slug}.md then
// (FEATURE already carries the {date}- prefix, so the folder is dated)
// return "{path} — {1-line summary}". Include the `**Execution:** ${p.exec}` field, and
// for exec==='workflow' require the `## Execution strategy` section.
```

Construct `draftPrompt(p, finding)` so each writer:
1. Gets the cold-start preamble (feature, goal, scope, constraints, this phase's objective, dependsOn) PLUS the project facts it needs: backend commands run from `backend/`; env is single-sourced at repo-root `.env`; and for DATA-layer phases the Prisma 7 gotchas (no `url` in schema, driver adapter via `@prisma/adapter-mariadb`, classic `prisma-client-js` generator, seed from `prisma.config.ts`, shadow-DB grant for `migrate dev`).
2. Gets its explorer's `files`/`apis`/`patterns`/`gotchas` so `Files to touch` and `Steps` are concrete and real.
3. Is told to Write exactly `docs/plans/{date}-{feature-name}/{NN}-{slug}.md` and nothing else, no editing existing code.
4. Embeds the phase-file template verbatim, including `**Execution:** {p.exec}` and — when `p.exec === 'workflow'` — the `## Execution strategy` section.

### Phase-file template (embed in each writer's prompt)

```markdown
# Phase {N}: {title}

**Plan:** [{feature-name}](00-overview.md)
**Depends on:** {previous phase file or "none"}
**Execution:** {solo | workflow}

## Context
{2–4 sentences so a cold session understands why this phase exists. One-line feature goal recap.}

## Objective
{One sentence — what this phase delivers.}

## Files to touch
- `path/to/file` — {what changes}

## Steps
1. {Concrete action — file + change}
2. ...

## Execution strategy        ← include ONLY when Execution is `workflow`
{What /execute should fan out and how to structure the workflow:}
- **Fan-out unit:** {one agent per file / per call-site / per layer / per dimension}
- **Shape:** {pipeline (independent items) | parallel barrier (need all results) | find→transform→verify}
- **Isolation:** {none — agents edit distinct files in the shared tree | worktree — agents would otherwise conflict}
- **Verify stage:** {what each item's verifier checks; adversarial if high-assurance}

## Verification
- `npm run lint` (from `backend/`)
- `npm test` (from `backend/`; or the scoped `*.spec.ts` subset this phase adds)
- {for DATA phases: `npx prisma migrate dev --name <name>` then `npx prisma migrate reset` to confirm migrations + seed apply cleanly}
- {manual check if applicable: emails in Mailpit `http://localhost:8025`, data via `npx prisma studio` / `mysql` against `localhost:3306` db `pollendar`, API via `npm run start:dev` at `http://localhost:3000/api`}

## Acceptance
- [ ] {phase-specific observable signal}
```

Closing instruction for every writer: *Leave changes uncommitted; the user commits manually (Conventional Commits with a lower-case scope, no co-author trailers). Do NOT push or open a PR. Do NOT write any file outside `docs/plans/{date}-{feature-name}/`. Do NOT edit existing code — this is planning only.*

## After the workflow returns

1. Verify each phase file exists at its expected path (the workflow result lists what was written).
2. **You** write `00-overview.md` (don't delegate — you have the holistic view):

```markdown
# {Feature title}

**Slug:** `{feature-name}` (folder: `docs/plans/{date}-{feature-name}/`)
**Created:** {YYYY-MM-DD}
**Status:** planned

## Goal
{1–3 sentences.}

## Scope
- {layer/module}: {what changes}

## Out of scope
- {explicit non-goal}

## Constraints
- {perf / schema / compat / deadline}

## Acceptance criteria
- [ ] {observable signal}

## Phases
1. [01-{slug}](01-{slug}.md) — {one-line summary} · _{solo | workflow}_
2. [02-{slug}](02-{slug}.md) — {one-line summary} · _{solo | workflow}_

## Open questions
- {unresolved item, or empty}
```

Note each phase's execution strategy in the overview's phase list so the reader sees at a glance which phases fan out.

## Report

Surface: created file paths, the per-phase `solo`/`workflow` split, and any open questions left in the overview. No other closing chatter.

## Phase sizing heuristics

- Schema/migration → own phase, isolated from consuming code. Prisma migrations live under `backend/prisma/migrations/`, applied with `npx prisma migrate dev`, reset (re-runs migrations + seed) with `npx prisma migrate reset`.
- **No expand→contract / version-floor / force-update migration contract.** Pollendar's DB schema is consumed ONLY by the in-repo NestJS API — it does not deploy independently of any client (no mobile app, no external versioned consumers). So migrations and their consuming code can change atomically; keep migration guidance light and concrete (migrate dev / reset, inspect via `npx prisma studio` / `mysql` / Mailpit). Do NOT bake in backward-compat migration sequencing.
- New shared/cross-module code → phase before the code that consumes it. (There is no separate shared package today; respect the NestJS module boundaries under `backend/src/`.)
- **Respect the existing module/layer boundaries.** Place new NestJS code in its own module under `backend/src/` mirroring the existing `prisma/` and `config/` modules (and the planned `auth/`, `polls/`, `public/`, `responses/`, `notifications/` layout in `docs/PLAN.md`). Unit specs live next to source as `*.spec.ts` under `backend/src/`; e2e specs under `backend/test/`. Writer prompts run cold, so interpolate the relevant placement convention into every draft prompt.
- Frontend work → SKIP. The `frontend/` Vue app is not scaffolded; do not write frontend phases or invent its commands until it exists.
- Tests live in the phase that adds the code they cover — no trailing "add tests" phase.
- Each phase ~1–4 hours of focused work, independently verifiable, ends at a green verification (lint + tests, plus a migrate/seed or Mailpit/Studio check where relevant).

## Don'ts

- Don't write a plan for trivial work (single-file edit, rename, one-line fix) — skip the workflow entirely and tell the user it's not plan-worthy.
- Don't reference conversation context inside phase files or workflow prompts — both run cold.
- Don't add a "review" or "polish" phase — fold into prior phase's acceptance.
- Don't ask follow-ups that don't change plan structure.
- Don't let the workflow write outside `docs/plans/{date}-{feature-name}/`.
- Don't mark a phase `workflow` just because it's large — mark it `workflow` only when the fan-out (sweep / multi-layer / high-assurance like auth/JWT/session paths / discovery) genuinely pays off.
- Don't duplicate env/secrets under `backend/` — everything reads the repo-root `.env`.
- Don't reintroduce a `url` in `schema.prisma` or switch to the ESM `prisma-client` generator — both break this toolchain.

## Output style

- Brief. No preamble, no recap, no chatter.
- Bullet points over prose.
- Lead with the answer; cut everything that isn't actionable.
- Questions (if any): one line each, batched in a single `AskUserQuestion`.
- No closing summary beyond the file-paths + execution-split report.
