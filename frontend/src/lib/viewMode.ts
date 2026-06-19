/**
 * Persist the public poll's Vote|Results view choice per device, keyed by the poll's share token,
 * namespaced under `pollendar:vm:<pollPublicToken>`. Mirrors `participantToken.ts`'s per-poll keying.
 *
 * Every access is wrapped in try/catch: private-mode browsers and storage-disabled environments
 * throw on `localStorage`, and the poll must still render even if we cannot remember the last tab.
 * A read failure (or any unknown stored value) is treated as "no stored mode".
 */

export type ViewMode = 'vote' | 'results'

const KEY_PREFIX = 'pollendar:vm:'

function keyFor(pollPublicToken: string): string {
  return `${KEY_PREFIX}${pollPublicToken}`
}

/** Read the stored view mode for a poll, or `null` if none/unknown (or storage is unavailable). */
export function getViewMode(pollPublicToken: string): ViewMode | null {
  try {
    const stored = localStorage.getItem(keyFor(pollPublicToken))
    return stored === 'vote' || stored === 'results' ? stored : null
  } catch {
    return null
  }
}

/** Persist the chosen view mode for a poll. Silently no-ops if storage is unavailable. */
export function saveViewMode(pollPublicToken: string, mode: ViewMode): void {
  try {
    localStorage.setItem(keyFor(pollPublicToken), mode)
  } catch {
    // Storage disabled / quota exceeded — the toggle still works; we just can't remember it.
  }
}
