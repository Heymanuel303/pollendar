/**
 * Persist the participant's own edit token (the `{ publicToken }` returned by
 * `POST /public/polls/:token/responses`) so a returning visitor can later edit their response. It is
 * keyed by the *poll's* share token, namespaced under `pollendar:pt:<pollPublicToken>`.
 *
 * Every access is wrapped in try/catch: private-mode browsers and storage-disabled environments
 * throw on `localStorage`, and a participant must still be able to submit even if we cannot remember
 * their edit token. A read failure is treated as "no token stored".
 *
 * NOTE: the backend `PUT /public/participants/:participantToken` edit route is not implemented yet
 * (see the plan's Open questions), so this token is persisted forward-compatibly — the "Edit my
 * response" affordance currently re-opens `/p/:publicToken` rather than hitting a real edit endpoint.
 */

const KEY_PREFIX = 'pollendar:pt:'

function keyFor(pollPublicToken: string): string {
  return `${KEY_PREFIX}${pollPublicToken}`
}

/** Persist the participant's edit token for a poll. Silently no-ops if storage is unavailable. */
export function saveParticipantToken(pollPublicToken: string, participantToken: string): void {
  try {
    localStorage.setItem(keyFor(pollPublicToken), participantToken)
  } catch {
    // Storage disabled / quota exceeded — the submit still succeeded; we just can't remember it.
  }
}

/** Read the stored edit token for a poll, or `null` if none is stored (or storage is unavailable). */
export function getParticipantToken(pollPublicToken: string): string | null {
  try {
    return localStorage.getItem(keyFor(pollPublicToken))
  } catch {
    return null
  }
}

/** Remove the stored edit token for a poll. Silently no-ops if storage is unavailable. */
export function clearParticipantToken(pollPublicToken: string): void {
  try {
    localStorage.removeItem(keyFor(pollPublicToken))
  } catch {
    // Nothing to do — treat as already cleared.
  }
}
