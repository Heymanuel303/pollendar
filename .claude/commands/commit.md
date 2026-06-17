---
description: Stage and commit the current phase/plan changes with a Conventional Commits message derived from the working-tree diff and the related plan + phase. Inspects status/diff/log first; never pushes, amends, or force-anything.
argument-hint: "[scope or message hint, e.g. backend phase 2]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(git rev-parse:*), Bash(git ls-files:*), Read, Glob, Grep
---

## Working-tree state (captured before you act)

Current status:

!`git status --short --branch`

Staged + unstaged change summary:

!`git rev-parse --verify HEAD >/dev/null 2>&1 && git diff --stat HEAD || git diff --stat`

Unstaged diff (working tree vs index):

!`git diff`

Staged diff (index vs HEAD):

!`git diff --cached`

Recent commit messages (match this repo's style/conventions):

!`git log --oneline --no-decorate -15 2>/dev/null || echo '(no commits yet)'`

Plan files touched most recently (to discover the related plan + phase):

!`git status --porcelain -- plan 2>/dev/null; git ls-files -m -o --exclude-standard -- plan 2>/dev/null`

## Your task

Create exactly ONE commit that captures the changes for the just-executed phase (or plan). You are language/stack agnostic: infer everything from the diff and the repo, never from an assumed framework.

If the optional hint was provided, treat it as guidance for the scope and/or the related plan phase: `$ARGUMENTS`

### 0. Clean-tree guard

If the status above shows NO changes (nothing staged, nothing unstaged, nothing untracked relevant), then the working tree is clean. Say exactly that — "Working tree is clean; nothing to commit." — and STOP. Do not create an empty commit.

### 1. Understand what changed

Read the diffs above. Group the changes mentally into:
- The intended work (the source/test/config files for the executed phase).
- Anything unrelated (stray edits, debug leftovers, unrelated files that happen to be dirty).

If a file's purpose is unclear, Read it (or the relevant hunk) before deciding. Do not commit changes you cannot explain. If the captured diff above was truncated or summarized, run a fuller `git diff -- <path>` for the files you need to inspect.

### 2. Discover the related plan + phase

Determine which plan and phase this commit belongs to, in this priority order:
1. The hint in `$ARGUMENTS`, if it names a scope and/or phase (e.g. `backend phase 2`, `auth-magic-link 1`).
2. Otherwise, look at the plan files surfaced above. Find the phase file `plan/<scope>/NN-<phase-slug>.md` that was most recently modified — especially one whose frontmatter `status:` is now `done`. Use Glob (`plan/*/*.md`) and Read its frontmatter (`plan:`, `phase:`, `title:`) to confirm.
3. If no plan/phase can be confidently determined, proceed WITHOUT a plan reference rather than guessing.

Record, when found: the plan `<scope-slug>`, the phase number `N`, and the phase title.

### 3. Decide what to stage (be deliberate)

- Prefer staging only the files that belong to this phase's work (the intended group from step 1), including its tests and the updated `plan/<scope>/NN-*.md` (status flipped to `done`, acceptance boxes ticked).
- Do NOT run a blind `git add -A` if the tree contains unrelated dirty files. Stage explicit paths instead (`git add <path> <path> ...`).
- If the working tree contains ONLY the phase's changes (nothing unrelated), staging everything is fine.
- If you find unrelated changes, leave them unstaged and note in your final summary that they were excluded and why.
- Use `git add -- <path>` form to be safe with unusual filenames. Stage with the appropriate `Bash(git add:*)` calls.

After staging, you may re-run `git diff --cached --stat` to confirm the staged set matches your intent.

### 4. Compose the Conventional Commits message

Format: `type(scope): subject`

- `type`: choose from `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`, `ci`, `style` — pick the one that best matches the dominant change in the diff (e.g. new endpoint/feature -> `feat`; bug fix -> `fix`; only tests -> `test`; tooling/config -> `chore`/`build`).
- `scope`: prefer the plan `<scope-slug>` when known (e.g. `backend`, `auth-magic-link`); otherwise a concise scope inferred from the touched area (module/dir/layer). Omit the scope parentheses if no sensible scope exists.
- `subject`: imperative mood, lower-case start, no trailing period, ~50 chars. Describe WHAT the phase delivered, not the file list.
- Body: a short blank-line-separated set of `- ` bullets summarizing the substantive changes (what/why), grounded in the diff. Reference the plan + phase on its own line when known, e.g. `Plan: backend phase 2 - <phase title>`. No co-author trailers, no "Generated with" lines, no filler.

Build the commit with multiple `-m` flags to keep the subject and body clean, e.g.:
`git commit -m "feat(backend): add user authentication endpoints" -m "- ..." -m "- ..." -m "Plan: backend phase 2 - Auth endpoints"`

### 5. Safety rules (do not violate)

- Create exactly one commit. Do NOT push. Do NOT `git push`, `--force`, or `--force-with-lease`.
- Do NOT `git commit --amend` or rebase — never rewrite published/existing history.
- Do NOT add co-author or `Co-Authored-By`/`Generated with` trailers.
- Do NOT modify files other than staging them; if a file needs a content change, that is out of scope for this command.

### 6. Report

After committing, output a concise summary: the final commit subject line, the list of staged paths committed, and (if any) the unrelated paths you intentionally left out. If you stopped early (clean tree, or no confident plan reference), say why.
