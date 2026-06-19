# Phase 4: Email copy

**Plan:** [plain-copy-and-calm-glow](00-overview.md)
**Depends on:** 03-straightforward-app-copy.md
**Execution:** solo
**Status:** completed

## Context
The overall feature makes Pollendar feel calmer and less AI-written: the glow/bloom visual effect is dialed to near-flat, and UI plus email copy is rewritten into a plain, direct voice (the winning-slot label becomes "Top pick", never "In bloom"). The poll-completed email currently reads in a formal, AI-flavoured register ("is finalized", "has a final time", "has been finalized", "Final slot"), and the magic-link body uses an em dash inside a sentence. This phase rewrites the backend email prose and subjects into the plain voice and aligns the poll-completed email with the "Top pick" terminology, without touching the dusk dark-email layout markup, CSS class names, test IDs, or any logic.

## Objective
Rewrite the backend email templates and their subjects to the plain voice, align the poll-completed email with "Top pick", and update the matching specs so all tests stay green.

## Files to touch
- `backend/src/mail/templates/poll-completed.ts` — rewrite the subject, heading, body paragraph, preheader, the visible "Final slot" chip label, and the plain-text block to the plain voice and "Top pick" vocabulary; reword the doc-comment phrase that describes the user-facing slot label.
- `backend/src/mail/templates/magic-link.ts` — remove the em dash from the sign-in body sentence; keep wording otherwise plain (no metaphor/hype added).
- `backend/src/mail/templates/layout.ts` — no copy change required (shell/footer copy is already plain and literal); only revisit if a copy string here is found to violate the style guide. The footer note "You received this email because someone used this address with Pollendar. If that wasn't you, you can safely ignore it." is acceptable as-is — leave it.
- `backend/src/mail/mail.service.ts` — no prose lives here (it only forwards `subject`/`text`/`html` from the renderers); confirm no copy change is needed and leave it untouched.
- `backend/src/notifications/notifications.service.ts` — no copy lives here (it only calls `renderPollCompleted()` / `renderSlotLabel()`); leave it untouched.
- `backend/src/mail/mail.service.spec.ts` — update the assertion that checks the poll-completed subject so it matches the new subject (currently `expect(arg.subject).toContain('Team offsite')` at line 94, plus the escaping test at line 117 `expect(arg.subject).toContain('<b>x</b>')`). These two should keep passing unchanged IF the new subject still embeds the raw title verbatim; verify and adjust only if the rewrite changes how the title appears.
- `backend/src/mail/templates/layout.spec.ts` — line 83 uses `paragraph('Final slot: <strong>Mon</strong>')` as TEST DATA for the `paragraph()` helper (it asserts the helper preserves inline `<strong>` HTML and uses `DUSK.dim`). It is NOT an assertion about real email copy. Leave it untouched.
- `backend/src/notifications/notifications.service.spec.ts` — `POLL_TITLE` and `SLOT_LABEL` constants are test fixtures, not copy. No change needed; leave untouched.
- `backend/scripts/preview-emails.ts` — sample data only (`sampleSlotLabel = 'Mon Jun 22, 10:00'`, `samplePollTitle`, URLs). No hardcoded copy strings to rewrite. Leave untouched.

## Steps

Apply the PLAIN-VOICE STYLE GUIDE below to every edit. Change wording/tone only. Never change data shapes, props, routes, test IDs, CSS class names, or the escaping chokepoint (`escapeHtml`). Do not pass copy/labels through `escapeHtml` yourself — the renderers already escape user-controlled values (`pollTitle`, `finalSlotLabel`, `shareUrl`).

### A. `backend/src/mail/templates/poll-completed.ts`

This renderer has THREE output parts plus a chip label plus a doc-comment, all of which must use consistent "Top pick" vocabulary but need NOT be identical strings:

1. Subject (line 36). Change
   `const subject = `Poll "${pollTitle}" is finalized`;`
   to a plainer, direct subject that still embeds the raw `${pollTitle}` verbatim so the existing subject assertions (mail.service.spec.ts line 94 `toContain('Team offsite')` and line 117 `toContain('<b>x</b>')`) keep passing. Use:
   `const subject = `Pollendar picked a time for "${pollTitle}"`;`

2. Chip label (line 50). The uppercase caption is a VISIBLE label, not a CSS token. Change
   `` `Final slot</p>` + ``
   to
   `` `Top pick</p>` + ``
   Leave the slot value `<p ...>${safeSlot}</p>` (lines 51-52) exactly as-is — it is user data.

3. Heading (line 56). Change
   `heading('Your poll is finalized') +`
   to
   `heading('Pollendar picked a time') +`

4. Body paragraph (line 57). Change
   ``paragraph(`The poll <strong>${safeTitle}</strong> has a final time.`) +``
   to a plain sentence that keeps the escaped title in `<strong>`:
   ``paragraph(`The poll <strong>${safeTitle}</strong> now has a chosen time.`) +``
   (Keep `${safeTitle}` — already escaped. No em dash, no metaphor.)

5. Preheader (line 67). Change
   `preheaderText: 'Your poll has a final time',`
   to
   `preheaderText: 'Pollendar picked a time for your poll',`

6. Plain-text block (lines 71-73). Change
   ```
   `The poll "${pollTitle}" has been finalized.\n\n` +
   `Final slot: ${finalSlotLabel}\n\nView the poll: ${shareUrl}`;
   ```
   to
   ```
   `Pollendar picked a time for the poll "${pollTitle}".\n\n` +
   `Top pick: ${finalSlotLabel}\n\nView the poll: ${shareUrl}`;
   ```
   (Keep `${pollTitle}`, `${finalSlotLabel}`, `${shareUrl}` raw — text is not HTML.)

7. Doc-comments describing user-facing copy. In the file header (lines 1-12) and the `@param finalSlotLabel` line (line 27 "The chosen final slot's human label"), reword any phrase that describes the visible label so it matches "Top pick" framing where it documents user-facing text. Pure-internal mentions (e.g. references to `escapeHtml`, the `{ subject, html, text }` triple) stay. Minimal, optional touch — do not rename the function `renderPollCompleted` or its params.

### B. `backend/src/mail/templates/magic-link.ts`

8. Sign-in body sentence (lines 38-41). It contains an em dash inside a full sentence, which the style guide bans. Change
   ```
   paragraph(
     'Tap the button below to sign in. This link is for you alone — no ' +
       'password required.',
   ) +
   ```
   to a version with no em dash and plain voice, e.g.
   ```
   paragraph(
     'Tap the button below to sign in. This link is for you alone. No ' +
       'password required.',
   ) +
   ```
   Leave the subject `'Your Pollendar sign-in link'`, heading `'Sign in to Pollendar'`, CTA `'Sign in to Pollendar'`, the fallback-link paragraph, the expiry note, the preheader `'Your one-time sign-in link for Pollendar'`, and the plain-text block as-is (already plain; no em dashes there).

### C. Specs

9. After the poll-completed rewrite, the new subject `Pollendar picked a time for "${pollTitle}"` still contains the raw title, so `backend/src/mail/mail.service.spec.ts` line 94 (`toContain('Team offsite')`) and line 117 (`toContain('<b>x</b>')`) continue to hold. Run the suite to confirm. If you instead choose a subject that does NOT embed the raw title verbatim, you MUST update those two assertions in the same edit — but the subject in step 1 is chosen specifically so no spec edit is required.
10. `backend/src/mail/templates/layout.spec.ts` line 83 and `backend/src/notifications/notifications.service.spec.ts` constants are test data, not copy assertions — confirm and leave untouched.
11. `backend/scripts/preview-emails.ts` is sample data only — confirm and leave untouched.

## Verification
- `cd backend && npm run lint`
- `cd backend && npm test -- mail.service.spec` and `cd backend && npm test -- layout.spec` and `cd backend && npm test -- notifications.service.spec` (or `cd backend && npm test` for the full backend suite)
- `grep -rn "In bloom\|in bloom\|blooms\|Final slot\|is finalized\|has a final time\|has been finalized" backend/src/mail backend/src/notifications` returns ONLY the `layout.spec.ts:83` test-data line for `paragraph('Final slot: <strong>Mon</strong>')` (which is intentionally left as helper test data) and nothing else.
- `grep -rn "—" backend/src/mail/templates/magic-link.ts` returns nothing (no em dash left in the magic-link body).
- Manual email check (optional, dev): with Mailpit running, `cd backend && npx tsx scripts/preview-emails.ts`, then open http://localhost:8025 and confirm the poll-completed email shows the chip label "Top pick", the heading "Pollendar picked a time", and no "In bloom"/"finalized" wording; the spicy sample title still renders as literal characters (escaping intact).

## Acceptance
- [x] The poll-completed email's visible chip label reads "Top pick" (not "Final slot"), and its subject, heading, body paragraph, preheader, and plain-text block read in the plain voice with no "finalized"/"final time" phrasing.
- [x] The magic-link email body contains no em dash and stays plain and accurate.
- [x] `backend/src/mail/mail.service.ts` and `backend/src/notifications/notifications.service.ts` are unchanged (they hold no copy).
- [x] `cd backend && npm run lint` and `cd backend && npm test` both pass with no spec edits required beyond what step 9 describes.
- [x] The grep checks above pass: no banned bloom/finalized wording in `backend/src/mail`/`backend/src/notifications` (except the intentional `layout.spec.ts:83` test-data line) and no em dash in `magic-link.ts`.

---

### PLAIN-VOICE STYLE GUIDE (embedded for a cold session)
- Voice: plain, direct, present tense. Say what the thing is or does. Lead with the action. Short declarative sentences.
- Ban: metaphor-as-explanation, hype adjectives (seamless, effortless, elevate, delightful, magical, unlock), rule-of-three lists, and "not just X, it is Y" constructions.
- The winning-slot label is exactly "✦ Top pick" (keep the ✦), never "In bloom". The in-app pills carry the ✦; these email files never had one, so the email chip label stays the plain text "Top pick" (no ✦ added).
- Punctuation: do NOT use em dashes (—) inside full sentences; use a period, comma, or parentheses instead. Keep the middot (·) ONLY as a compact separator inside short metadata labels; do not use it inside running prose. (The email templates use no middots in prose; none to add.)
- Brand: keep the name "Pollendar", the pollen-dot logo, and AT MOST one subtle optional nod to the pollen idea. All functional and marketing copy must be literal and direct.

### TERM MAP relevant to this phase (old → new)
- `Poll "${pollTitle}" is finalized` (subject) → `Pollendar picked a time for "${pollTitle}"`
- `Your poll is finalized` (heading) → `Pollendar picked a time`
- `The poll <strong>${safeTitle}</strong> has a final time.` (body) → `The poll <strong>${safeTitle}</strong> now has a chosen time.`
- `Your poll has a final time` (preheader) → `Pollendar picked a time for your poll`
- `Final slot` (chip label) → `Top pick`
- `The poll "${pollTitle}" has been finalized.` (text) → `Pollendar picked a time for the poll "${pollTitle}".`
- `Final slot: ${finalSlotLabel}` (text) → `Top pick: ${finalSlotLabel}`
- magic-link body em dash `... for you alone — no password required.` → `... for you alone. No password required.`
