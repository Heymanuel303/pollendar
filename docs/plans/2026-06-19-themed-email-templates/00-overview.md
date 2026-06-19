# Themed Email Templates

**Slug:** `themed-email-templates` (folder: `docs/plans/2026-06-19-themed-email-templates/`)
**Created:** 2026-06-19
**Status:** completed

## Goal
Reskin Pollendar's two transactional emails — the passwordless magic-link sign-in and the
poll-finalized notification — as branded HTML matching the app's "Dusk Calendar" dark theme.
Built with hand-rolled, inline-styled, table-based TypeScript template helpers: **no new npm
dependency and no build step**. True-dark dusk look using bulletproof dark-email patterns so it
still renders correctly in light-mode inboxes.

## Scope
- `backend/src/mail/templates/` (NEW): dusk-theme tokens + a reusable bulletproof dark-email
  layout helper + two per-email renderers.
- `backend/src/mail/mail.service.ts`: `sendMagicLink` / `sendPollCompleted` refactored to
  delegate to the renderers — **method signatures unchanged**, so callers stay untouched.
- `backend/scripts/preview-emails.ts` (NEW): a tsx dev script that pushes sample renders
  through Mailpit (http://localhost:8025) for visual QA.
- Tests: `mail.service.spec.ts` extended; a new `layout.spec.ts`; `notifications.service.spec.ts`
  confirmed unchanged.

## Out of scope
- No new email types (only the existing magic-link + poll-completed are reskinned).
- No templating library, MJML, react-email, or any build/compile pipeline.
- No changes to `nodemailer` transport wiring, SMTP/Mailpit/Resend config, `MailService`
  method signatures, or the callers (`auth.service.ts:86`, `notifications.service.ts:146`).
- No hosted logo/image assets — branding is a CSS/text wordmark on the dusk palette.

## Constraints
- Hand-rolled inline-styled, table-based HTML strings only; **no `<style>` blocks, no external
  CSS, no webfont `@import`/`<link>`** (Google Fonts won't load in most clients — web-safe
  fallback chains stand on their own).
- Bulletproof dark-email patterns: `color-scheme` + `supported-color-schemes` metas, hidden
  preheader span, MSO/Outlook conditional fallback for the gold CTA button.
- Every user-controlled interpolation (poll title, slot label, URLs, link) **HTML-escaped**
  through a single `escapeHtml` chokepoint to prevent markup injection.
- Keep a plaintext alternative alongside every HTML body (multipart `text` + `html`).
- Dusk tokens: canvas `#14122B`, surface `#211E40`, surface2 `#2B2752`, line `#36325E`,
  pollen/brand `#FFC857`, pollenDeep `#F0A93B`, moonlight/text `#F4F2FF`, dim `#B8B3DE`,
  mute `#7E79AE`, mint/success `#6FE0B0`, coral/error `#FF7A6B`. Display font Space Grotesk
  (headings/numerals), body font Inter — both with web-safe fallbacks.
- All backend commands run from `backend/`.

## Acceptance criteria
- [x] Both emails render with the dusk dark theme (violet canvas/surface card, pollen-gold CTA)
      in Mailpit at http://localhost:8025.
- [x] `MailService.sendMagicLink` / `sendPollCompleted` delegate to the new renderers with
      **unchanged signatures**; `mail.service.ts` no longer contains inline `<p>`-tag HTML.
- [x] User-controlled input is HTML-escaped (a `<` in a poll title renders as `&lt;`), proven
      by a unit spec.
- [x] `npm test` (full suite), `npm run lint`, and `npm run format` are all green from `backend/`;
      `notifications.service.spec.ts` passes untouched.

## Phases
1. [01-email-template-foundation](01-email-template-foundation.md) — dusk tokens, bulletproof
   table-based dark-email layout helper (shell + heading + paragraph + gold CTA + footer +
   preheader + `escapeHtml`), `layout.spec.ts`, and a tsx Mailpit preview script · _solo_ ✓
2. [02-reskin-transactional-emails](02-reskin-transactional-emails.md) — `magic-link.ts` +
   `poll-completed.ts` renderers returning `{ subject, html, text }` on the Phase 1 layout,
   `MailService` rewired to delegate (signatures intact), specs updated · _solo_ ✓

## Open questions
- None.
