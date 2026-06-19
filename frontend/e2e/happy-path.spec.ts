import { test, expect } from '@playwright/test'
import { getLatestMessageTo, extractMagicLinkToken, assertBodyContains } from './helpers/mailpit'

/**
 * End-to-end happy path for Pollendar (PLAN.md Phase 7):
 *   sign in via magic link (Mailpit) → create a poll → share → vote as an anonymous participant in a
 *   second browser context → watch the best slot bloom → complete the poll → assert the completion
 *   email lands in Mailpit.
 *
 * Prereqs (see README): docker-compose (MySQL + Mailpit on :8025) + the NestJS backend
 * (:3000/api, migrated, CORS enabled) running. The Vite dev server (booted by playwright.config's
 * webServer) proxies `/api` to the backend so the httpOnly auth cookie stays same-origin.
 *
 * Reruns are isolated by a per-run timestamp baked into the emails, this avoids the
 * `@@unique([pollId, email])` participant conflict and stays under the 5-req/60s magic-link throttle
 * (one magic-link request per run).
 */

const POLL_TITLE = 'Team sync'
const POLL_DESCRIPTION = 'Looking for a good evening next week.'

test('creator signs in, builds a poll, a participant votes, and the poll completes', async ({
  browser,
}) => {
  const runId = Date.now()
  const creatorEmail = `creator-${runId}@example.test`
  const participantEmail = `participant-${runId}@example.test`
  const participantName = 'Robin Participant'

  // ── 1. Sign in via magic link ────────────────────────────────────────────────────────────────
  const creatorContext = await browser.newContext()
  const creator = await creatorContext.newPage()

  const signInAt = new Date().toISOString()
  await creator.goto('/')
  await creator.locator('#email-gate-input').fill(creatorEmail)
  await creator.getByRole('button', { name: 'Send magic link' }).click()
  // Anti-enumeration: the UI always confirms regardless of whether the email has an account.
  await expect(creator.getByText('Check your inbox')).toBeVisible()

  const magicLinkEmail = await getLatestMessageTo(creatorEmail, { since: signInAt })
  const magicToken = extractMagicLinkToken(magicLinkEmail)

  // The callback view POSTs /api/auth/verify (sets cookies) then redirects to /dashboard.
  await creator.goto(`/auth/callback?token=${magicToken}`)
  await expect(creator).toHaveURL(/\/dashboard$/)

  // ── 2. Create a poll ─────────────────────────────────────────────────────────────────────────
  // The editor seeds one date with one 18:00–20:00 slot, so the default form is already valid
  // (CreatePollDto requires dates[].slots ArrayMinSize(1)).
  await creator.goto('/polls/new')
  await creator.getByPlaceholder('Team dinner').fill(POLL_TITLE)
  await creator.getByPlaceholder('Looking for a good evening next week.').fill(POLL_DESCRIPTION)
  await creator.getByRole('button', { name: /create poll/i }).click()

  // POST /api/polls → 201, redirect to the manage view /polls/:id.
  await expect(creator).toHaveURL(/\/polls\/\d+$/)
  await expect(creator.getByRole('heading', { name: POLL_TITLE })).toBeVisible()
  const manageUrl = creator.url()

  // ── 3. Read + verify the share link ──────────────────────────────────────────────────────────
  const shareLink = await creator.getByTestId('share-link').inputValue()
  // Built from the app origin (never a hard-coded path): absolute origin + `/p/<publicToken>`.
  expect(shareLink).toMatch(/^https?:\/\/[^/]+\/p\/[^/]+$/)
  const tokenMatch = shareLink.match(/\/p\/([^/?#]+)$/)
  expect(tokenMatch, `share link "${shareLink}" should end in /p/<token>`).not.toBeNull()
  const publicToken = tokenMatch![1]

  // ── 4. Vote as an anonymous participant (fresh, un-authed context) ───────────────────────────
  const participantContext = await browser.newContext()
  const participant = await participantContext.newPage()
  await participant.goto(`/p/${publicToken}`)

  await expect(participant.getByRole('heading', { name: POLL_TITLE })).toBeVisible()
  // The poll's timezone line renders ("Times shown in {timezone}").
  await expect(participant.getByText('Times shown in')).toBeVisible()

  await participant.locator('#participant-name').fill(participantName)
  await participant.locator('#participant-email').fill(participantEmail)
  // Tri-state toggle: the UI "Yes" maps to the server enum `available`.
  const yes = participant.getByRole('button', { name: 'Yes', exact: true }).first()
  await yes.click()
  await expect(yes).toHaveAttribute('aria-pressed', 'true')

  await participant.getByRole('button', { name: /submit availability/i }).click()

  // POST /api/public/.../responses → 201 { publicToken }; navigates to the done screen.
  await expect(participant).toHaveURL(new RegExp(`/p/${publicToken}/done`))
  await expect(participant.getByRole('heading', { name: "You're in!" })).toBeVisible()
  await expect(participant.getByText(`Thanks ${participantName}`)).toBeVisible()

  // ── 5. Best slot updates / blooms on the creator's manage view ───────────────────────────────
  await creator.goto(manageUrl)
  const bloom = creator.getByTestId('best-slot-bloom')
  await expect(bloom).toContainText('Top pick')
  // The participant's single `available` answer shows in the results table (2×yes + maybe = score 2).
  await expect(creator.getByText(/1\s+yes/)).toBeVisible()

  // ── 6. Complete the poll (the bloomed slot becomes the final slot) ────────────────────────────
  const completeAt = new Date().toISOString()
  await creator.getByTestId('complete-btn').click()
  const dialog = creator.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /complete poll/i }).click()

  // POST /api/polls/:id/complete → status: completed. The header pill flips to "Completed"
  // (status-driven, so reliable regardless of the bloom card's own state).
  await expect(dialog).toBeHidden()
  await expect(creator.getByText('Completed', { exact: true })).toBeVisible()

  // ── 7. Completion email lands in Mailpit (sent to the participant who left an email) ──────────
  const completionEmail = await getLatestMessageTo(participantEmail, { since: completeAt })
  expect(completionEmail.subject).toContain(POLL_TITLE)
  // Body references the poll title (re-completing the same slot is idempotent and sends no second mail).
  assertBodyContains(completionEmail, POLL_TITLE)

  await participantContext.close()
  await creatorContext.close()
})
