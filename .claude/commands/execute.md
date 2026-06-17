---
description: Execute ONE phase of an existing multi-phase plan. Reads the plan overview and target phase file cold, verifies dependencies are done, implements the phase steps against the project's real (discovered) stack, ALWAYS adds and runs the phase's tests until green, then marks the phase done. Leaves changes uncommitted.
argument-hint: [phase N from @plan/<scope>/00-overview.md | @plan/<scope>/NN-phase.md]
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, Task
---

# Execute a plan phase

You are executing exactly ONE phase of a multi-phase plan. Work from the files on disk, not from prior conversation memory. Do not commit — committing is the separate `/commit` command.

ARGUMENTS: $ARGUMENTS

## 0. Resolve the target plan + phase (parse `$ARGUMENTS`)

`$ARGUMENTS` arrives in one of two shapes. Detect which, and resolve to a single concrete phase file under `plan/<scope-slug>/`:

1. **`phase <N> from @<overview-path>`** — e.g. `phase 1 from @plan/backend/00-overview.md`.
   - The plan directory is the directory of the referenced overview (e.g. `plan/backend/`).
   - The phase number is `<N>`. Resolve the phase file by listing the plan directory and selecting the file whose name begins with the zero-padded number `NN-` (e.g. `01-`, `02-`). N may be given un-padded (`1`); always match against the zero-padded prefix. There is exactly one file per number — if zero or more than one match, STOP and report the ambiguity.

2. **A direct phase file** — `@<plan/<scope>/NN-phase.md>` (e.g. `@plan/backend/01-schema.md`).
   - Use that file directly as the target phase. Its directory is the plan directory; its `00-overview.md` sibling is the overview.

If `$ARGUMENTS` references the `00-overview.md` with NO phase number, do not guess. STOP and ask which phase to run (or suggest the first phase whose `status` is not `done`).

After resolving, you must know two paths: `PLAN_DIR/00-overview.md` (the overview) and `PLAN_DIR/NN-<slug>.md` (the target phase). Both are relative to the project root.

## 1. Read COLD

Read these files fresh now — do not rely on anything from earlier in the conversation:

- The overview `PLAN_DIR/00-overview.md`.
- The target phase file `PLAN_DIR/NN-<slug>.md`.

The phase file is authored to this exact, self-contained format (restated here so this command needs no sibling file):

```
---
phase: <N>
title: <short title>
plan: <scope-slug>
status: pending            # pending | in-progress | done
depends_on: [<phase numbers, may be empty>]
execution: solo|workflow
---

## Goal
## Context & files     (paths to read/modify — discovered from the repo)
## Steps               (ordered, concrete, actionable, language-agnostic)
## Tests               (which tests to add + how to run them, using the detected test runner)
## Acceptance criteria (a GitHub checkbox list; objective and verifiable)
## Out of scope
```

The overview's frontmatter (`status`, `phases`) and its `## Phases` table describe the whole plan. The `## Phases` table is static structure — its columns are `# | title | depends on | execution | one-line goal` and it carries NO status column. Use the table only for the dependency MAP (the `depends on` column lists the same phase numbers as each phase's `depends_on` frontmatter). The authoritative status of any phase lives ONLY in that phase file's own frontmatter `status`.

**Status state machine:** `pending -> in-progress -> done`. `/plan` always writes `pending`. This command flips the phase to `in-progress` at the start of implementation and to `done` only on success (all tests green + acceptance criteria met).

## 2. Guard: dependencies must be done

Read each phase number listed in the target phase's `depends_on` frontmatter (cross-check against the overview `## Phases` table `depends on` column if you want — they list the same numbers). For each dependency, open the corresponding `NN-*.md` file in the same plan directory and read its frontmatter `status` (this is the authoritative status — never infer it from the overview table).

- If ANY dependency is not `status: done`, STOP. Report which dependency phases are unfinished and tell the user to run `/execute` on them first. Do not modify any files.
- If `depends_on` is empty or all dependencies are `done`, proceed.

Also check the target phase's own `status`:
- If it is already `done`, warn the user it appears complete and ask for confirmation before re-running (re-running may be a no-op or may redo work).
- If it is `in-progress`, note that a prior attempt may have left partial changes; continue, but be careful to make steps idempotent where possible.

## 3. Mark in-progress

Edit the target phase file's frontmatter: set `status: in-progress`. Then, in the overview `00-overview.md` frontmatter, set `status: in-progress` if it is currently `pending` (the overview frontmatter always has a `status` key per the plan contract; do not touch the `## Phases` table — it has no status column).

## 4. Discover the real stack (language-agnostic)

Never assume a language, framework, or test runner. Detect them from the repository before implementing:

- Read the paths named in the phase's `## Context & files`. Use Glob/Grep/Read to inspect the actual files and surrounding code so your changes match existing conventions (naming, structure, style, error handling).
- Detect build/dependency manifests and lockfiles at the repo root and in relevant subdirectories (e.g. `package.json`, `pnpm-lock.yaml`, `cargo.toml`, `go.mod`, `pyproject.toml`, `pom.xml`, `build.gradle`, `composer.json`, `Gemfile`, `Makefile`, `justfile`, etc. — whatever is present).
- Detect the **test runner** from those manifests' scripts/dev-dependencies and from existing test directories/config (e.g. a `test`/`test:e2e` script, a test config file, existing `*.spec.*` / `*_test.*` / `test_*.py` files, a `tests/` folder). Prefer the command the project already uses. If the phase's `## Tests` section names the runner/command, that takes precedence.

You may run discovery in parallel with subagents (the Task tool) for large repos, but keep all file edits in this main context.

## 5. Implement the Steps

Work through the phase's `## Steps` in order, top to bottom. They are the source of truth for what to build. For each step:

- Make the concrete code/file change using the discovered stack and existing conventions.
- Stay within scope — honor the phase's `## Out of scope` section and do not implement future phases.
- Keep changes minimal and coherent; match the repo's existing patterns rather than introducing new ones.

If a step is blocked (missing info, contradicts the repo state, or depends on something not present), STOP, report the blocker precisely (which step, why), and do not fake progress. Leave the phase `in-progress`.

## 6. Tests — HARD, NON-SKIPPABLE

This step is mandatory. You may not mark the phase done without it.

1. **Add the tests described in the phase's `## Tests` section.** Write every test it specifies, placed where the project keeps tests, in the project's existing test style. If the section describes behavior to cover but not exact cases, add concrete tests that verify the phase's acceptance criteria.
2. **Run the tests** using the detected test runner (the command from step 4 / the phase's `## Tests` section). Scope the run to the new/affected tests when the runner supports it, but ensure the phase's tests actually execute.
3. **Iterate until green.** If tests fail, diagnose, fix the implementation or the tests, and re-run. Repeat until the phase's tests pass.
4. If after genuine effort the tests cannot pass due to an external blocker (missing service, credentials, environment), STOP and report the exact failure, the command used, and the output. Leave the phase `in-progress`. Never edit a test merely to make it pass without verifying real behavior, and never delete/skip a test to go green.

Capture the final test command and its passing output — you will report it at the end.

## 7. Mark done + tick acceptance criteria

Only after the phase's tests are green:

- Edit the target phase file: set frontmatter `status: done`.
- In the phase's `## Acceptance criteria` section, change each satisfied checkbox from `- [ ]` to `- [x]`. Every criterion must be objectively met; if one cannot be ticked truthfully, the phase is NOT done — return to step 5/6 or report the gap.
- Update the overview `00-overview.md` frontmatter `status`: set it to `done` if this was the last phase still not `done`, otherwise set/leave it `in-progress`. Do NOT edit the `## Phases` table — it is static structure with no status column.

## 8. Leave dirty + report

Do NOT run `git add`, `git commit`, or any commit. Leave the working tree dirty.

End with a concise report:

- **Phase:** `<N> — <title>` of plan `<scope-slug>` → `status: done`.
- **Changed:** the files you created/modified (use `git status --short` / `git diff --stat` to be accurate).
- **Tests:** the exact test command run and the pass result (counts).
- **Acceptance:** confirm each criterion is now ticked.
- **Next:** suggest `/commit` to commit this phase, then `/execute phase <N+1> from @PLAN_DIR/00-overview.md` (or the next not-`done` phase) — or note the plan is complete if no phases remain.
