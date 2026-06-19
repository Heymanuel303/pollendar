# Phase 1: Email Template Foundation

**Plan:** [themed-email-templates](00-overview.md)
**Depends on:** none
**Execution:** solo

## Context
Pollendar sends two transactional emails (passwordless magic-link sign-in and poll-finalized notification) via `MailService` using nodemailer, currently as bare `<p>` HTML strings (`backend/src/mail/mail.service.ts:38,66`). The goal of this plan is to reskin both emails as branded HTML matching the app's "Dusk Calendar" dark theme using hand-rolled, inline-styled, table-based HTML — no new npm dependency and no build step. This phase builds the shared foundation (theme tokens + a bulletproof dark-email layout helper + a dev preview script) so the per-email renderers in later phases just compose these pieces. No existing source is edited here; `MailService` and its callers stay untouched.

## Objective
Create a reusable branded email shell — a dusk-theme tokens module, a table-based bulletproof dark-email layout/render helper (HTML-escape, shell, heading, paragraph, gold CTA button, footer, hidden preheader), and a tsx dev preview script that pushes sample renders through Mailpit — plus a unit test for the layout helper.

## Files to touch
- `backend/src/mail/templates/tokens.ts` — NEW. Export the frozen Dusk theme token map (hex colors) and the two web-safe font-family fallback chains (display + body) as named consts. No NestJS, pure module-level exports.
- `backend/src/mail/templates/layout.ts` — NEW. Export pure helper functions that build bulletproof dark-email HTML from the tokens: `escapeHtml`, `preheader`, `heading`, `paragraph`, `ctaButton`, `footer`, and a top-level `renderShell` that wraps inner HTML in the full table-based document (doctype, color-scheme metas, hidden preheader, dusk canvas/surface, footer). All styles INLINE — no `<style>` blocks. No NestJS, no imports of `MailService`.
- `backend/src/mail/templates/layout.spec.ts` — NEW. Jest unit test for `escapeHtml`, `ctaButton`, and `renderShell` (collocated `.spec.ts`, the repo's test convention).
- `backend/scripts/preview-emails.ts` — NEW. A standalone tsx script that builds 2–3 sample email bodies from the layout helpers and sends them to Mailpit (`localhost:1025`, no auth) via nodemailer, so renders can be eyeballed at http://localhost:8025. Does NOT import `MailService` or Nest; constructs its own `nodemailer.createTransport`.

## Steps
1. Create `backend/src/mail/templates/tokens.ts`. Add a file-header JSDoc (mirror the doc-comment style of `mail.service.ts:6-11`). Export `export const DUSK = { canvas: '#14122B', surface: '#211E40', surface2: '#2B2752', line: '#36325E', pollen: '#FFC857', pollenDeep: '#F0A93B', moonlight: '#F4F2FF', dim: '#B8B3DE', mute: '#7E79AE', mint: '#6FE0B0', coral: '#FF7A6B' } as const;`. Also export font fallback chains as plain strings: `export const FONT_DISPLAY = "'Space Grotesk', Georgia, 'Times New Roman', Arial, sans-serif";` and `export const FONT_BODY = "'Inter', Arial, Helvetica, sans-serif";` (webfonts will not load in most email clients, so the chains MUST stand on their own with web-safe fallbacks; do NOT add any `@import` or `<link>` for fonts).
2. Create `backend/src/mail/templates/layout.ts`. Import `{ DUSK, FONT_DISPLAY, FONT_BODY }` from `./tokens`. Implement:
   - `export function escapeHtml(value: string): string` — escape `&` first, then `<`, `>`, `"`, `'` (order matters; `&` must be replaced before the others). This is the single chokepoint every user-controlled interpolation (poll title, slot label, URLs) MUST pass through.
   - `export function preheader(text: string): string` — return a hidden `<span>` with inline styles `display:none; max-height:0; overflow:hidden; mso-hide:all;` etc., containing `escapeHtml(text)`, so the preview snippet is controlled and not leaked from body copy.
   - `export function heading(text: string): string` — an `<h1>`-equivalent (use a styled `<p>` or `<h1>` with all-inline styles) using `FONT_DISPLAY`, color `DUSK.moonlight`, bold weight.
   - `export function paragraph(html: string): string` — a styled `<p>` using `FONT_BODY`, color `DUSK.dim`, sane line-height. The argument is treated as already-safe HTML (callers escape user input before passing it in); document that in a comment.
   - `export function ctaButton(label: string, href: string): string` — a table-based, bulletproof gold button: background `DUSK.pollen`, text color `DUSK.canvas` (dark text on gold for contrast), `FONT_DISPLAY`, rounded corners via inline style, and an MSO/Outlook conditional fallback (`<!--[if mso]> ... VML roundrect or padded table ... <![endif]-->`) so Outlook renders the gold fill. Both `label` and `href` MUST be passed through `escapeHtml` before interpolation.
   - `export function footer(): string` — a muted footer block (`DUSK.mute`) with a "Pollendar" wordmark line and a small "you received this because…" note, inside the surface band.
   - `export function renderShell(opts: { preheaderText: string; bodyHtml: string }): string` — the full document: `<!DOCTYPE html>`, `<html>` with `lang`, `<head>` containing `<meta charset>`, `<meta name="viewport">`, `<meta name="color-scheme" content="dark">`, and `<meta name="supported-color-schemes" content="dark">`; `<body>` with `bgcolor`/inline background `DUSK.canvas`; the hidden `preheader(...)` first; an outer 100% table on `DUSK.canvas`; a centered inner ~600px table card on `DUSK.surface` with `DUSK.line` border; `opts.bodyHtml` in the content cell; then `footer()`. Every element styled INLINE; no `<style>` block; no external CSS.
   - Keep all functions pure (string in → string out) and free of NestJS/`MailService` imports so they are trivially unit-testable and reusable by the preview script and later phases.
3. Create `backend/src/mail/templates/layout.spec.ts` following the repo Jest convention (collocated, `*.spec.ts`, `rootDir` is `src/` per `package.json:77`). No `Test.createTestingModule` needed — these are pure functions. Cover:
   - `escapeHtml`: input `"<script>alert('x')&\"\""` produces output containing none of the raw `<`, `>` (assert it does NOT `.toContain('<script>')` and DOES `.toContain('&lt;')`).
   - `ctaButton('Open Poll', 'https://x.test/p?q="onmouseover')`: asserts the `href` value is escaped (no raw unescaped `"` breaking the attribute) and the label text appears, and the gold color `#FFC857` is present.
   - `renderShell({ preheaderText, bodyHtml })`: asserts the output starts with `<!DOCTYPE`, contains `color-scheme`, contains the canvas hex `#14122B`, contains the provided `bodyHtml`, and contains the hidden preheader text — confirming the bulletproof scaffold is wired.
4. Create `backend/scripts/preview-emails.ts` as a standalone tsx script (invoked `npx tsx scripts/preview-emails.ts` from `backend/`; tsx auto-loads tsconfig + env per the seed convention in `package.json:23`). It MUST NOT import `MailService` or bootstrap Nest. Instead:
   - Read SMTP target from env with Mailpit defaults: `host = process.env.SMTP_HOST ?? 'localhost'`, `port = Number(process.env.SMTP_PORT ?? 1025)`, no auth, `from = process.env.MAIL_FROM ?? 'Pollendar <no-reply@pollendar.test>'`, recipient `to = process.env.PREVIEW_TO ?? 'preview@pollendar.test'`.
   - `const transporter = nodemailer.createTransport({ host, port, secure: false });`
   - Build sample renders using the layout helpers only (these stand in for the real bodies the later phases will produce): one "magic link" sample (heading + paragraph + `ctaButton('Sign in to Pollendar', sampleLink)` + a "link expires shortly / used once" note) and one "poll finalized" sample (heading + paragraph mentioning a sample poll title, a final-slot line, + `ctaButton('View the poll', sampleShareUrl)`). Use a deliberately spicy sample title like `Team sync <b>"Q3"</b> & lunch` to visually confirm escaping in Mailpit.
   - `await transporter.sendMail({ from, to, subject, html: renderShell({ preheaderText, bodyHtml }), text })` for each sample (include a plaintext `text` alongside `html` so the multipart shape mirrors production).
   - Log a one-line confirmation per sample (`console.log` is fine here; this is a script, not a Nest provider) and a final pointer to http://localhost:8025. Wrap in an async `main()` with a `.catch` that logs and `process.exit(1)`.

## Verification
- From `backend/`: `npm run format` then `npm run lint` (lint auto-fixes; must exit clean on the new files).
- From `backend/`: `npm test -- layout` (runs `backend/src/mail/templates/layout.spec.ts`; all assertions green). Optionally `npm test -- mail.service` to confirm nothing in the mail module regressed (this phase touches no existing file, so it should still pass).
- Manual: ensure Mailpit is up (`docker compose up -d` from repo root if needed), then from `backend/` run `npx tsx scripts/preview-emails.ts`. Open http://localhost:8025 and confirm: both emails arrive; the dark dusk canvas/surface render; the gold CTA button shows with dark text; headings use the display fallback font; and the spicy sample title renders as literal text (e.g. `<b>"Q3"</b>` visible as characters, NOT bold/injected) — proving `escapeHtml` works.

## Acceptance
- [x] `backend/src/mail/templates/tokens.ts` and `backend/src/mail/templates/layout.ts` exist, export the named helpers/tokens above, contain zero `<style>` blocks and zero font `@import`/`<link>`, and do not import `MailService` or NestJS.
- [x] `npm test -- layout` passes, including the escaping assertion (raw `<script>` never appears in `escapeHtml`/`ctaButton`/`renderShell` output).
- [x] `npx tsx scripts/preview-emails.ts` delivers both sample emails to Mailpit and they render at http://localhost:8025 with the dusk theme, a gold bulletproof CTA, and the user-supplied sample title escaped to literal text.
- [x] `npm run lint` and `npm run format` are clean; no existing source file (mail.service.ts, auth.service.ts, notifications.service.ts, or their specs) was modified.
