import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError } from '@/lib/api/client'
import { getPublicPoll, getResults, submitResponses } from '@/lib/api/public-poll'
import { saveParticipantToken } from '@/lib/participantToken'
import type { PollResults, PublicPoll, SubmitResponsesDto } from '@/lib/api/types'

/** Lifecycle of a single request, so views can switch declaratively on the state. */
type RequestState = 'idle' | 'loading' | 'success' | 'error'

/**
 * Anonymous participant store: owns the data-fetching for the public poll flow so the `PublicPoll` /
 * `PublicThanks` views stay declarative (they never touch `fetch` or the api module directly).
 *
 * - `load(token)`     → GET the sanitized poll for `/p/:token`.
 * - `submit(token, …)`→ POST the response; on 201 persist the participant's edit token and resolve it.
 * - `loadResults(token)` → GET the live best slot + tallies for the thanks page / bloom.
 *
 * NOTE: the spec calls the results action `results`, but that collides with the reactive `results`
 * ref it populates (a setup store cannot expose both under one name) — the action is therefore
 * `loadResults`, the ref stays `results`.
 *
 * `errorCode` mirrors the last `ApiError.status` so a view can branch on **409** (duplicate email —
 * keep the form, show the server's message inline) vs a generic failure.
 */
export const usePublicPollStore = defineStore('publicPoll', () => {
  /** The sanitized poll for the current share token, or `null` before/after a failed load. */
  const poll = ref<PublicPoll | null>(null)
  /** Live results (best slot + per-slot tallies), or `null` until `loadResults` resolves. */
  const results = ref<PollResults | null>(null)

  const loadState = ref<RequestState>('idle')
  const submitState = ref<RequestState>('idle')

  /** HTTP status of the last failure (e.g. `409`/`404`/`400`), or `null`. Drives 409-specific UI. */
  const errorCode = ref<number | null>(null)
  /** Human-readable message for the last failure (the server's exact text when available), or `null`. */
  const errorMessage = ref<string | null>(null)

  function resetError(): void {
    errorCode.value = null
    errorMessage.value = null
  }

  /** Load the sanitized poll. On failure clears `poll` and records the error code/message. */
  async function load(token: string): Promise<void> {
    loadState.value = 'loading'
    resetError()
    try {
      poll.value = await getPublicPoll(token)
      loadState.value = 'success'
    } catch (err) {
      poll.value = null
      applyError(err)
      loadState.value = 'error'
    }
  }

  /**
   * Submit the participant's answers. On 201, persist the returned `publicToken` (their edit token)
   * keyed by the poll's share token and resolve it. On failure, record the code/message (a **409**
   * sets `errorCode = 409` + the server message and does NOT persist anything) and rethrow so the
   * view can decide not to navigate.
   */
  async function submit(token: string, payload: SubmitResponsesDto): Promise<string> {
    submitState.value = 'loading'
    resetError()
    try {
      const { publicToken } = await submitResponses(token, payload)
      saveParticipantToken(token, publicToken)
      submitState.value = 'success'
      return publicToken
    } catch (err) {
      applyError(err)
      submitState.value = 'error'
      throw err
    }
  }

  /**
   * Load the live results for the thanks page / bloom. A failure here is non-fatal (the thanks page
   * still renders without the best-slot card), so it records the error but does not throw.
   */
  async function loadResults(token: string): Promise<void> {
    try {
      results.value = await getResults(token)
    } catch (err) {
      results.value = null
      applyError(err)
    }
  }

  function applyError(err: unknown): void {
    if (err instanceof ApiError) {
      errorCode.value = err.status
      errorMessage.value = messageFor(err)
    } else {
      errorCode.value = null
      errorMessage.value = 'Could not reach the server — please try again.'
    }
  }

  return {
    poll,
    results,
    loadState,
    submitState,
    errorCode,
    errorMessage,
    load,
    submit,
    loadResults,
  }
})

/** Map an {@link ApiError} to a single user-facing sentence, preferring the server's own message. */
function messageFor(err: ApiError): string {
  const body = err.body as { message?: string | string[] } | null
  const message = body?.message
  // class-validator returns an array of messages on a 400; show the first.
  if (Array.isArray(message)) return message[0] ?? 'Please check your responses and try again.'
  if (typeof message === 'string' && message !== '') return message
  if (err.status === 404) return 'This poll could not be found.'
  return 'Something went wrong — please try again.'
}
