---
description: Plan a multi-phase, language-agnostic implementation by exploring the real repo and writing a stable plan artifact under plan/<scope-slug>/. Planning only — writes no implementation code.
argument-hint: [topic or scope to plan, e.g. "backend" or "auth magic link"]
allowed-tools: Task, Write, Edit, Bash(ls:*), Bash(find:*), Bash(cat:*), Bash(test:*), Bash(date:*), Bash(mkdir:*), Bash(pwd:*), Bash(git ls-files:*), Bash(git rev-parse:*)
---

You are operating in PLAN-ONLY mode. Your job is to produce a clear, ordered, multi-phase implementation plan as files on disk. You MUST NOT write, edit, or scaffold any implementation/production code, configuration, tests, or migrations. The ONLY files you create or modify are the plan artifacts under `plan/<scope-slug>/`.

## Topic / scope

The topic to plan is: $ARGUMENTS

If the topic is empty or thin, infer the scope from the recent conversation history (what the user has been discussing/asking for). State the scope you settled on explicitly before proceeding.

## Step 1 — Locate the project root and orient

- Determine the project root (prefer the git toplevel if this is a repo):

!`git rev-parse --show-toplevel 2>/dev/null || pwd`

- Get a high-level view of the repository layout (top levels only, ignoring noise):

!`find . -maxdepth 2 -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/.svn/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/target/*' -not -path '*/.venv/*' -not -path '*/vendor/*' 2>/dev/null | sort | head -200`

Plans live at the PROJECT ROOT under `plan/<scope-slug>/`. All paths you write into the artifacts MUST be repo-relative so the plan travels with the repo.

## Step 2 — DISCOVER the stack and layers (NO assumptions)

Do NOT assume any language, framework, or test runner. Discover everything from evidence in the repo. Look for:

- Build manifests / lockfiles that reveal the language and tooling, e.g. `package.json`, `pnpm-lock.yaml`/`yarn.lock`/`package-lock.json`, `pyproject.toml`/`requirements.txt`/`Pipfile`, `go.mod`, `Cargo.toml`, `pom.xml`/`build.gradle`, `composer.json`, `Gemfile`, `pubspec.yaml`, `*.csproj`/`*.sln`, `mix.exs`, etc. Read the relevant ones to learn scripts, dependencies, and the declared test runner.
- Config files that reveal frameworks and tooling (ORM/db config, migration folders, server/app entrypoints, frontend bundler/app config, monorepo workspace config).
- Existing test directories, test file naming conventions, and any test/CI scripts — this is how you DETECT the test runner. Record the exact command(s) to run tests.

Decide which of the four canonical layers ACTUALLY EXIST in this repo. A layer exists only if you find real evidence for it:

- **db** — schema, migrations, ORM models, database config/seed.
- **backend** — server/API/application code and its manifest.
- **frontend** — client/UI app and its manifest.
- **tests** — a dedicated/identifiable test suite and a runnable test command.

Only layers with concrete evidence are "explored" and recorded in `layers_explored`. Do not invent layers that aren't there.

If this is a brand-new or empty repo with NO concrete evidence for any layer (greenfield), record `layers_explored: []`, skip the parallel explorers in Step 3, and base the plan on the topic and conversation history instead. The output still follows the same file/section structure described below — only the source of grounding changes.

## Step 3 — EXPLORE existing layers IN PARALLEL via subagents

For EACH layer that actually exists, dispatch ONE read-only explorer subagent using the Task/Agent tool. Launch them in a SINGLE batch so they run in PARALLEL (one message, multiple Task calls). Do not spawn an explorer for a layer that does not exist. (If the repo is greenfield with no layers, skip this step entirely per Step 2.)

Each explorer is READ-ONLY: it must not modify any files. Give each explorer a focused brief, for example:

- **db explorer**: identify the schema/models, migration mechanism and current migration state, seed data, and the database engine; list the key files (repo-relative).
- **backend explorer**: identify the entrypoint, module/route/controller/service structure, how config and persistence are wired, existing endpoints/features relevant to the topic, and the conventions in use; list key files.
- **frontend explorer**: identify the app entrypoint, routing, state/data-fetching approach, component structure, and how it talks to the backend; list key files.
- **tests explorer**: identify the test runner and EXACT invocation command(s), the test directory layout and naming conventions, existing coverage near the topic, and any fixtures/helpers/factories; list key files.

Each explorer should return: the key files (repo-relative paths) with a one-line note each, the conventions/patterns to follow, the current state relevant to the topic, and any gaps or risks. Wait for all explorers to finish, then synthesize their findings.

## Step 4 — Design the phases

From the synthesized findings, design a sequence of SMALL, ordered phases. Rules:

- Each phase is independently executable and ends in a TESTED, verifiable state (it always has tests to add and a way to run them).
- Order by real dependencies; make `depends_on` explicit using phase numbers. Earlier phases unblock later ones.
- Prefer many small phases over a few large ones. Split when a phase would touch many concerns at once.
- Honor a natural BACKEND-BEFORE-FRONTEND ordering when both layers exist (data/schema, then backend logic + tests, then frontend that consumes it) — but keep this generic; let the real dependencies drive the order.
- For each phase, set `execution: solo` for a focused, single-concern phase, or `execution: workflow` for a heavier phase that spans multiple files/concerns and benefits from a multi-step approach.
- Steps and file paths must be grounded in what the explorers actually found — never in assumed framework conventions.

## Step 5 — Derive the scope slug and write the artifacts

Derive `<scope-slug>`: a short, kebab-case slug from the topic/scope (e.g. `backend`, `frontend`, `auth-magic-link`). Lowercase, words joined by hyphens, no spaces or punctuation.

Get today's date for the frontmatter:

!`date +%Y-%m-%d`

Create the directory `plan/<scope-slug>/` at the project root, then write the files below EXACTLY as specified. Every `/plan` run must produce this identical structure. Always write `status: pending`.

### Write `plan/<scope-slug>/00-overview.md`

Frontmatter (YAML), exactly these keys in this order:

```
---
plan: <scope-slug>
title: <human title>
created: <YYYY-MM-DD>
status: pending
layers_explored: [<only the layers that actually exist: db, backend, frontend, tests; [] if greenfield>]
phases: <N>
---
```

Body sections, in THIS fixed order with these exact headings:

```
## Goal
<what this plan achieves, in 1-3 sentences>

## Context
<current state per explored layer + the key files discovered (repo-relative), grounded in the explorers' findings>

## Phases
<a numbered Markdown table with columns: # | title | depends on | execution | one-line goal — one row per phase>

## Global acceptance criteria
<objective, verifiable criteria for the whole plan>

## Risks & open questions
<known risks, unknowns, and decisions deferred>
```

In the `## Phases` table, the `depends on` column lists the SAME phase numbers that appear in that phase file's `depends_on` frontmatter key — they are the same relationship under two display spellings (the table uses a space for readability; the frontmatter key is `depends_on`). The table carries the dependency MAP only; it has NO status column. Each phase's authoritative status lives solely in that phase file's frontmatter.

### Write one `plan/<scope-slug>/NN-<phase-slug>.md` per phase

`NN` is the zero-padded order starting at `01` (`01`, `02`, ...). `<phase-slug>` is a short kebab-case slug for that phase. Each phase file is SELF-CONTAINED.

Frontmatter (YAML), exactly these keys in this order:

```
---
phase: <N>
title: <short title>
plan: <scope-slug>
status: pending
depends_on: [<phase numbers, may be empty: []>]
execution: solo|workflow
---
```

Body sections, in THIS FIXED order with these EXACT headings (so `/execute` can parse them deterministically):

```
## Goal
<one paragraph: what this phase delivers>

## Context & files
<repo-relative paths to read and to modify/create, DISCOVERED from the repo — never assumed by stack. Note what each file is and why it matters to this phase.>

## Steps
<an ordered, numbered list of concrete, actionable, language-agnostic steps to implement the phase>

## Tests
<which tests to add (named, at specific paths following the discovered conventions) and the EXACT command(s) to run them using the project's DETECTED test runner>

## Acceptance criteria
<a GitHub checkbox list ("- [ ] ...") of objective, verifiable outcomes — these are what /execute ticks off>

## Out of scope
<what this phase deliberately does NOT do, to keep it small>
```

## Step 6 — Final summary

After writing all artifacts, print a short summary to the user:

- The `<scope-slug>` and the path `plan/<scope-slug>/`.
- The ordered phase list: `NN — <title>` for each phase, with its `depends_on`.
- The EXACT invocation to start phase 1, copy-paste ready:

  `/execute phase 1 from @plan/<scope-slug>/00-overview.md`

Reminder: you only PLANNED. You wrote no implementation code — only the plan artifacts under `plan/<scope-slug>/`.
