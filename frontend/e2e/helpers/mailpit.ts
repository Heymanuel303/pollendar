/**
 * Minimal Mailpit REST client for the e2e suite. Mailpit (the dev SMTP sink, web UI on `:8025`)
 * exposes a JSON API we poll to read the magic-link and completion emails the NestJS backend sends.
 *
 * Delivery is async, so reads retry with a short backoff. Configure the base URL via `MAILPIT_URL`
 * (default `http://localhost:8025`).
 *
 * Docs: https://mailpit.axllent.org/docs/api-v1/
 */

const MAILPIT_URL = (process.env.MAILPIT_URL ?? 'http://localhost:8025').replace(/\/$/, '')

/** A Mailpit message summary as returned by `GET /api/v1/search`. */
interface MailpitSummary {
  ID: string
  Created: string
}

/** A full Mailpit message as returned by `GET /api/v1/message/:id` (only the fields we read). */
interface MailpitMessage {
  ID: string
  Subject: string
  Text: string
  HTML: string
}

/** The text + HTML bodies of a delivered email, plus its subject. */
export interface EmailBody {
  subject: string
  text: string
  html: string
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${MAILPIT_URL}${path}`)
  if (!res.ok) {
    throw new Error(`Mailpit ${path} responded ${res.status}`)
  }
  return (await res.json()) as T
}

/**
 * Poll Mailpit for the most-recent message delivered to `email`, retrying until one appears or the
 * attempts run out. Resolves the message's text + HTML bodies; rejects if nothing arrives in time.
 *
 * `since` (an ISO timestamp captured before the action that triggers the email) filters out older
 * messages to the same address from a previous step, so consecutive reads never see a stale email.
 */
export async function getLatestMessageTo(
  email: string,
  opts: { since?: string; attempts?: number; intervalMs?: number } = {},
): Promise<EmailBody> {
  const attempts = opts.attempts ?? 30
  const intervalMs = opts.intervalMs ?? 1_000
  const sinceMs = opts.since ? Date.parse(opts.since) : 0

  for (let attempt = 0; attempt < attempts; attempt++) {
    const { messages } = await fetchJson<{ messages: MailpitSummary[] }>(
      `/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=20`,
    )
    // Search returns newest-first; take the first one newer than `since`.
    const match = messages.find((m) => !sinceMs || Date.parse(m.Created) >= sinceMs)
    if (match) {
      const full = await fetchJson<MailpitMessage>(`/api/v1/message/${match.ID}`)
      return { subject: full.Subject, text: full.Text, html: full.HTML }
    }
    await sleep(intervalMs)
  }
  throw new Error(`No Mailpit message for ${email} after ${attempts} attempts`)
}

/**
 * Pull the single-use `token` query param out of a magic-link email body. The backend builds the
 * link as `${APP_URL}/auth/callback?token=<base64url>` (see `AuthService`), so we match the token in
 * either the text or HTML body. Throws if no token is found.
 */
export function extractMagicLinkToken(body: EmailBody): string {
  const haystack = `${body.text}\n${body.html}`
  const match = haystack.match(/auth\/callback\?token=([A-Za-z0-9_-]+)/)
  if (!match?.[1]) {
    throw new Error('No magic-link token found in email body')
  }
  return match[1]
}

/** Assert an email body contains `substring` (checks text + HTML). Throws with context on miss. */
export function assertBodyContains(body: EmailBody, substring: string): void {
  if (!body.text.includes(substring) && !body.html.includes(substring)) {
    throw new Error(
      `Expected email body to contain "${substring}".\nSubject: ${body.subject}\nText: ${body.text}`,
    )
  }
}
