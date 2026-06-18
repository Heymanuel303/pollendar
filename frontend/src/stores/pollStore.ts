import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, post } from '@/lib/api/client'
import type { CreatePollPayload, CreatedPoll } from '@/types/poll'

/**
 * Creator-side poll store. This phase implements only `create()` (POST `/api/polls`); the rest of
 * the CRUD surface (`findOne`, `update`, `complete`, `remove`) lands in later phases. The shared
 * fetch client already sends cookie credentials + JSON headers, so the store never touches `fetch`.
 */
export const usePollStore = defineStore('poll', () => {
  /** True while a `create()` request is in flight (drives the submit button's loading state). */
  const creating = ref(false)
  /** Last create error as a human-readable message, or `null`. Cleared at the start of each attempt. */
  const error = ref<string | null>(null)

  /**
   * Create a poll with its nested dates + slots. Resolves the thin {@link CreatedPoll} (id +
   * shareable URL) on a 201. On a non-2xx it records a readable `error` (class-validator `400`
   * surfaces its first message; `409` is a conflict) and rethrows so the view can react.
   */
  async function create(payload: CreatePollPayload): Promise<CreatedPoll> {
    creating.value = true
    error.value = null
    try {
      return await post<CreatedPoll>('/polls', payload)
    } catch (err) {
      error.value = messageFor(err)
      throw err
    } finally {
      creating.value = false
    }
  }

  return { creating, error, create }
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
