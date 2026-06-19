/**
 * Pure builders for the participant-facing share copy. Kept dependency-free and side-effect-free so
 * the "Copy invite" text is unit-testable without mounting a component. The actual clipboard write
 * lives in `components/ui/CopyButton.vue`.
 */

/**
 * A short invite message containing the share URL, suitable for pasting into a chat. Falls back to a
 * generic noun when the poll has no title yet (e.g. a cold load that hasn't resolved the poll).
 */
export function buildInviteMessage(pollTitle: string, shareUrl: string): string {
  const title = pollTitle.trim() || 'a poll'
  return `Help us find a time for "${title}", add your availability here: ${shareUrl}`
}

/**
 * The canonical participant share URL for a poll, built from the app origin (never a hard-coded
 * localhost): `VITE_APP_URL` when set, otherwise `window.location.origin`.
 */
export function buildShareUrl(pollPublicToken: string): string {
  const origin = import.meta.env.VITE_APP_URL ?? window.location.origin
  return `${origin}/p/${pollPublicToken}`
}

/**
 * The full creator-facing invite message, the DESIGN.md §7 template the `ShareBox` shows and copies.
 * The optional `description` line and the `Please reply before …` line are included only when present,
 * matching the rendered §7 example exactly:
 *
 *   Hi! I'm trying to find the best time for "{title}".
 *   {description}
 *
 *   Add your availability here (takes ~1 min):
 *   {shareUrl}
 *
 *   Please reply before {closesAtHuman}.   ← only when closesAt is set
 *   Thanks!
 *
 * Kept pure (no clipboard, no formatting) so it is unit-testable; the caller passes the already
 * humanized `closesAtHuman` (e.g. via `formatCloseLabel`).
 */
export function buildFullInviteMessage(opts: {
  title: string
  description?: string | null
  shareUrl: string
  closesAtHuman?: string | null
}): string {
  const title = opts.title.trim() || 'a poll'
  const lines = [`Hi! I'm trying to find the best time for "${title}".`]
  const description = opts.description?.trim()
  if (description) lines.push(description)
  lines.push('', 'Add your availability here (takes ~1 min):', opts.shareUrl, '')
  if (opts.closesAtHuman) lines.push(`Please reply before ${opts.closesAtHuman}.`)
  lines.push('Thanks!')
  return lines.join('\n')
}
