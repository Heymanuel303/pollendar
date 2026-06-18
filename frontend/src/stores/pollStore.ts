import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, get, post } from '@/lib/api/client'
import type { CreatePollPayload, CreatedPoll } from '@/types/poll'
import type { PollDate, PollStatus } from '@/lib/api/types'

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
 * Creator-side poll store. Owns the dashboard **list** slice (`list()` → GET `/api/polls`) and poll
 * **create** (`create()` → POST `/api/polls`); the rest of the CRUD surface (`findOne`, `update`,
 * `complete`, `remove`) lands in later phases. The shared fetch client already sends cookie
 * credentials + JSON headers, so the store never touches `fetch`.
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
      polls.value = await get<Poll[]>('/polls')
    } catch {
      listError.value = 'Could not load your polls — please try again.'
    } finally {
      loading.value = false
    }
  }

  return { creating, error, create, polls, loading, listError, list }
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
