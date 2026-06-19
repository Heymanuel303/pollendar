import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  ApiError,
  get as apiGet,
  post as apiPost,
  patch as apiPatch,
  del as apiDel,
} from '@/lib/api/client'
import { getParticipantResponses } from '@/lib/api/public-poll'
import type { CreatePollPayload, CreatedPoll, UpdatePollPayload } from '@/types/poll'
import type {
  PollDate,
  PollStatus,
  Poll as OwnedPoll,
  PollResults,
  InviteMessage,
  ParticipantResponsesResult,
  ParticipantRow,
} from '@/lib/api/types'

/** Lifecycle of a single request, so views can switch declaratively on the state. */
type RequestState = 'idle' | 'loading' | 'success' | 'error'

/**
 * A poll row as returned by the **list** endpoint `GET /api/polls`
 * (`PollsService.findAllForUser` → `prisma.poll.findMany({ where:{userId}, orderBy:{createdAt:'desc'} })`).
 * This is the raw model row — there are NO nested `dates`, NO `_count`, and NO response count in the
 * payload today. The optional `responseCount` / `_count` / `dates` fields are declared
 * forward-compatibly so the card lights up automatically once the backend enriches the list; they
 * are always absent for now.
 *
 * Distinct from the *detail* `Poll` in `@/lib/api/types` (from `GET /api/polls/:id`), which always
 * carries nested `dates` + slots — the dashboard never fetches that heavier shape.
 *
 * TODO(phase-hardening): backend GET /polls should include `_count.participants` + a date range so
 * the card can show the response grains and the `Jun 26–28` range; see 99-hardening. Do NOT
 * synthesize these client-side.
 */
export interface Poll {
  id: string
  userId: string
  publicToken: string
  title: string
  description: string | null
  timezone: string
  status: PollStatus
  finalSlotId: string | null
  closesAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  /** Forward-compat (absent today): participant count from a future enriched list endpoint. */
  responseCount?: number
  /** Forward-compat (absent today): Prisma `_count` aggregate, if the list ever selects it. */
  _count?: { participants?: number }
  /** Forward-compat (absent today): nested candidate dates, for deriving the event date range. */
  dates?: PollDate[]
}

/**
 * Creator-side poll store. Owns the dashboard **list** slice (`list()` → GET `/api/polls`), poll
 * **create** (`create()` → POST `/api/polls`), and the manage-view detail slice — `get()`,
 * `loadResults()`, `loadInviteMessage()`, and `complete()`. The shared fetch client already sends
 * cookie credentials + JSON headers, so the store never touches `fetch`.
 */
export const usePollStore = defineStore('poll', () => {
  /** True while a `create()` request is in flight (drives the submit button's loading state). */
  const creating = ref(false)
  /** Last create error as a human-readable message, or `null`. Cleared at the start of each attempt. */
  const error = ref<string | null>(null)

  /** The creator's polls, newest-first — the list endpoint already orders `createdAt desc`. */
  const polls = ref<Poll[]>([])
  /** True while `list()` is in flight (drives the dashboard's calm loading affordance). */
  const loading = ref(false)
  /** Last `list()` error as a human-readable message, or `null`. Kept separate from create's `error`
   *  so a failed create never leaks into the dashboard (and vice versa). */
  const listError = ref<string | null>(null)

  // ── Manage-view detail slice (GET /polls/:id + live results + invite text + complete) ──────────
  /** The full owned poll (nested dates→slots) for the manage view, or `null` before load / on 404. */
  const currentPoll = ref<OwnedPoll | null>(null)
  /** Live aggregate results (best slot + per-slot tallies) for `currentPoll`, or `null`. */
  const results = ref<PollResults | null>(null)
  /** Per-participant rows (who voted + per-slot picks) for the owner-mode matrix, or `[]`.
   *  PRIVACY: rows carry `displayName` only — never email. */
  const participants = ref<ParticipantRow[]>([])
  /** Unfiltered participant count from the last `loadParticipants` (for any future pagination UI). */
  const participantsTotal = ref(0)
  /** `true` when more rows remain beyond the loaded page. */
  const participantsHasMore = ref(false)
  /** Lifecycle of the last `loadParticipants` — the matrix degrades to empty on `'error'`. */
  const participantsState = ref<RequestState>('idle')
  /** The backend invite text + canonical `shareUrl`, or `null`. `ShareBox` builds the full §7 copy. */
  const invite = ref<InviteMessage | null>(null)
  /** True while `get()` is in flight (drives the manage view's loading state). */
  const detailLoading = ref(false)
  /** `get()` failure as a human-readable message ("Poll not found" on a 404), or `null`. */
  const detailError = ref<string | null>(null)
  /** True while `complete()` is in flight (drives the Complete button's loading state). */
  const completing = ref(false)
  /** `complete()` failure as a human-readable message (409/400 surfaced cleanly), or `null`. */
  const completeError = ref<string | null>(null)
  /** True while `update()` is in flight (drives the edit form's save button). */
  const updating = ref(false)
  /** `update()` failure as a human-readable message (409 not-open / 400 validation), or `null`. */
  const updateError = ref<string | null>(null)
  /** True while `remove()` is in flight (drives the delete confirm button). */
  const removing = ref(false)
  /** `remove()` failure as a human-readable message, or `null`. */
  const removeError = ref<string | null>(null)
  /** True while a `cancel()`/`reopen()` lifecycle transition is in flight. */
  const lifecycleTransitioning = ref(false)
  /** `cancel()`/`reopen()` failure as a human-readable message, or `null`. */
  const lifecycleError = ref<string | null>(null)

  /**
   * Create a poll with its nested dates + slots. Resolves the thin {@link CreatedPoll} (id +
   * shareable URL) on a 201. On a non-2xx it records a readable `error` (class-validator `400`
   * surfaces its first message; `409` is a conflict) and rethrows so the view can react.
   */
  async function create(payload: CreatePollPayload): Promise<CreatedPoll> {
    creating.value = true
    error.value = null
    try {
      return await apiPost<CreatedPoll>('/polls', payload)
    } catch (err) {
      error.value = messageFor(err)
      throw err
    } finally {
      creating.value = false
    }
  }

  /**
   * Load the creator's polls via `GET /api/polls` (cookie credentials). The backend already orders
   * newest-first, so the result is assigned verbatim — **no client re-sort**. A 401 is not
   * special-cased here (the router guard gates the dashboard); any failure records a readable
   * `listError` and the dashboard offers a retry.
   */
  async function list(): Promise<void> {
    loading.value = true
    listError.value = null
    try {
      polls.value = await apiGet<Poll[]>('/polls')
    } catch {
      listError.value = 'Could not load your polls — please try again.'
    } finally {
      loading.value = false
    }
  }

  /**
   * Load one owned poll (nested dates→slots) via `GET /api/polls/:id`. A 404 (not owned / missing)
   * records the readable `detailError` "Poll not found" that the view renders as an empty state;
   * `currentPoll` is reset first so a stale poll never flashes during navigation.
   */
  async function get(id: string): Promise<void> {
    detailLoading.value = true
    detailError.value = null
    currentPoll.value = null
    try {
      currentPoll.value = await apiGet<OwnedPoll>(`/polls/${id}`)
    } catch (err) {
      detailError.value =
        err instanceof ApiError && err.status === 404
          ? 'Poll not found'
          : 'Could not load this poll — please try again.'
    } finally {
      detailLoading.value = false
    }
  }

  /**
   * Load the live aggregate results (best slot + per-slot tallies) via the public results endpoint
   * `GET /api/public/polls/:publicToken/results`. Results are supplementary to the page shell, so a
   * failure leaves `results` `null` and the view degrades (no bloom) rather than erroring the page.
   */
  async function loadResults(publicToken: string): Promise<void> {
    try {
      results.value = await apiGet<PollResults>(`/public/polls/${publicToken}/results`)
    } catch {
      results.value = null
    }
  }

  /**
   * Load the per-participant rows (who voted + per-slot picks) for the owner-mode matrix via the
   * public participants endpoint (`getParticipantResponses` → `GET /api/public/polls/:token/
   * participants-responses`), keyed by `currentPoll.publicToken`. Optional `limit`/`offset` page the
   * rows. Supplementary like {@link loadResults}: on failure the rows clear and `participantsState`
   * goes `'error'` (the matrix simply shows no responses) — it does NOT throw, so the manage page
   * still renders. PRIVACY: rows carry `displayName` only — never email.
   */
  async function loadParticipants(
    token: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<void> {
    participantsState.value = 'loading'
    try {
      const res: ParticipantResponsesResult = await getParticipantResponses(
        token,
        opts?.limit,
        opts?.offset,
      )
      participants.value = res.participants
      participantsTotal.value = res.total
      participantsHasMore.value = res.hasMore
      participantsState.value = 'success'
    } catch {
      participants.value = []
      participantsTotal.value = 0
      participantsHasMore.value = false
      participantsState.value = 'error'
    }
  }

  /**
   * Load the backend invite text + canonical `shareUrl` via `GET /api/polls/:id/invite-message`.
   * Supplementary like {@link loadResults}: on failure `invite` stays `null` and `ShareBox` falls
   * back to building the share URL from the app origin.
   */
  async function loadInviteMessage(id: string): Promise<void> {
    try {
      invite.value = await apiGet<InviteMessage>(`/polls/${id}/invite-message`)
    } catch {
      invite.value = null
    }
  }

  /**
   * Finalize a poll: `POST /api/polls/:id/complete` with `{ finalSlotId }`. On 200 the returned
   * updated poll (now `status:'completed'` + `finalSlotId` + `completedAt`) replaces `currentPoll`,
   * and results are re-fetched so the bloom reflects the final state. A 409 (no longer open) and a
   * 400 (slot not in this poll) are surfaced as readable `completeError`s; both are rethrown so the
   * view can keep its confirm dialog reactive. Idempotent server-side on an already-completed poll.
   */
  async function complete(pollId: string, finalSlotId: string): Promise<void> {
    completing.value = true
    completeError.value = null
    try {
      currentPoll.value = await apiPost<OwnedPoll>(`/polls/${pollId}/complete`, { finalSlotId })
      if (currentPoll.value) await loadResults(currentPoll.value.publicToken)
    } catch (err) {
      completeError.value = completeMessageFor(err)
      throw err
    } finally {
      completing.value = false
    }
  }

  /**
   * Edit an open poll: `PATCH /api/polls/:id` with the changed scalar fields and/or the full desired
   * nested `dates` tree (each row carrying its `id` + `invalidatedAt` marker). On 200 the returned
   * updated poll replaces `currentPoll` and results are re-fetched (a date/slot change can move the best
   * slot). The backend rejects an edit of a poll that is no longer `open` (409) and validation failures
   * (400); both are surfaced as a readable `updateError` and rethrown so the edit view stays reactive.
   * Voted dates/slots are immutable in place server-side — the creator marks them invalidated + re-adds.
   */
  async function update(pollId: string, payload: UpdatePollPayload): Promise<void> {
    updating.value = true
    updateError.value = null
    try {
      currentPoll.value = await apiPatch<OwnedPoll>(`/polls/${pollId}`, payload)
      if (currentPoll.value) await loadResults(currentPoll.value.publicToken)
    } catch (err) {
      updateError.value = updateMessageFor(err)
      throw err
    } finally {
      updating.value = false
    }
  }

  /**
   * Delete an owned poll: `DELETE /api/polls/:id` (204, cascade — votes go with it). On success the
   * detail slice (`currentPoll`/`results`/`invite`) is cleared and the row is dropped from the cached
   * `polls` list so the dashboard reflects the deletion without a re-fetch. A failure records a
   * readable `removeError` and rethrows so the confirm dialog stays reactive.
   */
  async function remove(pollId: string): Promise<void> {
    removing.value = true
    removeError.value = null
    try {
      await apiDel<void>(`/polls/${pollId}`)
      polls.value = polls.value.filter((p) => p.id !== pollId)
      currentPoll.value = null
      results.value = null
      invite.value = null
    } catch (err) {
      removeError.value = removeMessageFor(err)
      throw err
    } finally {
      removing.value = false
    }
  }

  /**
   * Cancel an open poll: `POST /api/polls/:id/cancel` (no body). Transitions status to `cancelled`,
   * which blocks new submissions just like `completed`. On 200 the updated poll replaces `currentPoll`
   * and results are re-fetched. A 409 (not open) is surfaced as `lifecycleError` and rethrown so the
   * confirm dialog stays reactive.
   */
  async function cancel(pollId: string): Promise<void> {
    lifecycleTransitioning.value = true
    lifecycleError.value = null
    try {
      currentPoll.value = await apiPost<OwnedPoll>(`/polls/${pollId}/cancel`)
      if (currentPoll.value) await loadResults(currentPoll.value.publicToken)
    } catch (err) {
      lifecycleError.value = lifecycleMessageFor(err)
      throw err
    } finally {
      lifecycleTransitioning.value = false
    }
  }

  /**
   * Reopen a cancelled OR completed poll: `POST /api/polls/:id/reopen` (no body). Transitions status
   * back to `open` and, from `completed`, clears `finalSlotId` + `completedAt` (the swapped poll
   * reflects this). On 200 the updated poll replaces `currentPoll` and results are re-fetched. A 409
   * (already open) is surfaced as `lifecycleError` and rethrown.
   */
  async function reopen(pollId: string): Promise<void> {
    lifecycleTransitioning.value = true
    lifecycleError.value = null
    try {
      currentPoll.value = await apiPost<OwnedPoll>(`/polls/${pollId}/reopen`)
      if (currentPoll.value) await loadResults(currentPoll.value.publicToken)
    } catch (err) {
      lifecycleError.value = lifecycleMessageFor(err)
      throw err
    } finally {
      lifecycleTransitioning.value = false
    }
  }

  return {
    creating,
    error,
    create,
    polls,
    loading,
    listError,
    list,
    currentPoll,
    results,
    participants,
    participantsTotal,
    participantsHasMore,
    participantsState,
    invite,
    detailLoading,
    detailError,
    completing,
    completeError,
    get,
    loadResults,
    loadParticipants,
    loadInviteMessage,
    complete,
    updating,
    updateError,
    update,
    removing,
    removeError,
    remove,
    lifecycleTransitioning,
    lifecycleError,
    cancel,
    reopen,
  }
})

/** Map an API/network failure to a single user-facing sentence. */
function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null
    const message = body?.message
    // class-validator returns an array of messages on a 400; show the first.
    if (Array.isArray(message)) return message[0] ?? 'Please check the form and try again.'
    if (typeof message === 'string' && message !== '') return message
    if (err.status === 409) return 'That conflicts with an existing entry.'
    return 'Could not create the poll. Please try again.'
  }
  return 'Could not reach the server — try again.'
}

/** Map a `complete()` failure to a single user-facing sentence, branching on the documented codes. */
function completeMessageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'Poll is no longer open.'
    if (err.status === 400) return "That slot isn't part of this poll."
    return 'Could not complete the poll. Please try again.'
  }
  return 'Could not reach the server — try again.'
}

/** Map an `update()` failure to a single user-facing sentence. */
function updateMessageFor(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null
    const message = body?.message
    if (Array.isArray(message)) return message[0] ?? 'Please check the form and try again.'
    if (typeof message === 'string' && message !== '') return message
    if (err.status === 409) return 'This poll can no longer be edited.'
    return 'Could not save your changes. Please try again.'
  }
  return 'Could not reach the server — try again.'
}

/** Map a `remove()` failure to a single user-facing sentence. */
function removeMessageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return 'This poll no longer exists.'
    return 'Could not delete the poll. Please try again.'
  }
  return 'Could not reach the server — try again.'
}

/** Map a `cancel()`/`reopen()` failure to a single user-facing sentence. */
function lifecycleMessageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'This poll is not in a state that allows that change.'
    return 'Could not change the poll status. Please try again.'
  }
  return 'Could not reach the server — try again.'
}
