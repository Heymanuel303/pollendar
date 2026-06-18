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
  return `Help us find a time for "${title}" — add your availability here: ${shareUrl}`
}

/**
 * The canonical participant share URL for a poll, built from the app origin (never a hard-coded
 * localhost): `VITE_APP_URL` when set, otherwise `window.location.origin`.
 */
export function buildShareUrl(pollPublicToken: string): string {
  const origin = import.meta.env.VITE_APP_URL ?? window.location.origin
  return `${origin}/p/${pollPublicToken}`
}
