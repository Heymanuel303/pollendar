import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Stub the client's `get`/`post`/`patch`/`del` so the store's actions are exercised against controlled
// resolutions/rejections. `ApiError` is the real class (preserved via the spread) so the store's
// `err instanceof ApiError` status branching is tested faithfully.
const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
  post: vi.fn<(path: string, body?: unknown, init?: RequestInit) => Promise<unknown>>(),
  patch: vi.fn<(path: string, body?: unknown, init?: RequestInit) => Promise<unknown>>(),
  del: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
}))
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return { ...actual, get, post, patch, del }
})

// `loadParticipants` delegates to the public-poll client (NOT the raw `get`), so stub that wrapper.
const { getParticipantResponses } = vi.hoisted(() => ({
  getParticipantResponses:
    vi.fn<(token: string, limit?: number, offset?: number) => Promise<unknown>>(),
}))
vi.mock('@/lib/api/public-poll', () => ({ getParticipantResponses }))

import { ApiError } from '@/lib/api/client'
import { usePollStore } from '../pollStore'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('pollStore.list', () => {
  it('GETs /polls and assigns the rows verbatim (no re-sort), clearing loading + error', async () => {
    get.mockResolvedValue([{ id: '2' }, { id: '1' }])
    const store = usePollStore()

    await store.list()

    expect(get).toHaveBeenCalledWith('/polls')
    expect(store.polls.map((p) => p.id)).toEqual(['2', '1'])
    expect(store.loading).toBe(false)
    expect(store.listError).toBeNull()
  })

  it('records a readable listError and clears loading when the request fails', async () => {
    get.mockRejectedValue(new Error('boom'))
    const store = usePollStore()

    await store.list()

    expect(store.polls).toEqual([])
    expect(store.listError).toBeTruthy()
    expect(store.loading).toBe(false)
  })
})

describe('pollStore.complete', () => {
  it('POSTs { finalSlotId }, swaps in the completed poll, and re-fetches results', async () => {
    const completed = {
      id: '42',
      publicToken: 'tok',
      status: 'completed',
      finalSlotId: '7',
      completedAt: '2026-06-18T12:00:00.000Z',
    }
    post.mockResolvedValueOnce(completed)
    get.mockResolvedValueOnce({ best: null, slots: [] }) // the post-complete results refresh

    const store = usePollStore()
    await store.complete('42', '7')

    expect(post).toHaveBeenCalledWith('/polls/42/complete', { finalSlotId: '7' })
    expect(store.currentPoll?.status).toBe('completed')
    expect(get).toHaveBeenCalledWith('/public/polls/tok/results')
    expect(store.completeError).toBeNull()
    expect(store.completing).toBe(false)
  })

  it('surfaces a 409 as a clean error and rethrows', async () => {
    post.mockRejectedValueOnce(new ApiError(409, { message: 'not open' }))
    const store = usePollStore()

    await expect(store.complete('42', '7')).rejects.toBeInstanceOf(ApiError)

    expect(store.completeError).toBe('Poll is no longer open.')
    expect(store.completing).toBe(false)
  })

  it('surfaces a 400 (slot not in this poll) as a clean error', async () => {
    post.mockRejectedValueOnce(new ApiError(400, { message: 'bad slot' }))
    const store = usePollStore()

    await expect(store.complete('42', '99')).rejects.toBeInstanceOf(ApiError)

    expect(store.completeError).toBe("That slot isn't part of this poll.")
  })
})

describe('pollStore.get', () => {
  it('stores the owned poll and clears detailError on success', async () => {
    get.mockResolvedValueOnce({ id: '42', title: 'Team dinner', status: 'open' })
    const store = usePollStore()

    await store.get('42')

    expect(get).toHaveBeenCalledWith('/polls/42')
    expect(store.currentPoll?.id).toBe('42')
    expect(store.detailError).toBeNull()
    expect(store.detailLoading).toBe(false)
  })

  it('maps a 404 to a "Poll not found" detailError', async () => {
    get.mockRejectedValueOnce(new ApiError(404, null))
    const store = usePollStore()

    await store.get('999')

    expect(store.currentPoll).toBeNull()
    expect(store.detailError).toBe('Poll not found')
  })
})

describe('pollStore.loadParticipants', () => {
  it('loads the per-participant rows via getParticipantResponses and records success', async () => {
    getParticipantResponses.mockResolvedValueOnce({
      participants: [{ participantId: 'p1', displayName: 'Ada', answers: [] }],
      total: 1,
      hasMore: false,
    })
    const store = usePollStore()

    await store.loadParticipants('tok')

    expect(getParticipantResponses).toHaveBeenCalledWith('tok', undefined, undefined)
    expect(store.participants).toEqual([{ participantId: 'p1', displayName: 'Ada', answers: [] }])
    expect(store.participantsTotal).toBe(1)
    expect(store.participantsHasMore).toBe(false)
    expect(store.participantsState).toBe('success')
  })

  it('passes through limit/offset pagination opts', async () => {
    getParticipantResponses.mockResolvedValueOnce({ participants: [], total: 0, hasMore: false })
    const store = usePollStore()

    await store.loadParticipants('tok', { limit: 50, offset: 100 })

    expect(getParticipantResponses).toHaveBeenCalledWith('tok', 50, 100)
  })

  it('clears state and records error on failure WITHOUT rejecting (non-fatal)', async () => {
    getParticipantResponses.mockRejectedValueOnce(new Error('boom'))
    const store = usePollStore()

    await expect(store.loadParticipants('tok')).resolves.toBeUndefined()

    expect(store.participants).toEqual([])
    expect(store.participantsTotal).toBe(0)
    expect(store.participantsHasMore).toBe(false)
    expect(store.participantsState).toBe('error')
  })
})

describe('pollStore.update', () => {
  it('PATCHes the payload, swaps in the updated poll, and re-fetches results', async () => {
    patch.mockResolvedValueOnce({ id: '42', publicToken: 'tok', status: 'open', title: 'New', dates: [] })
    get.mockResolvedValueOnce({ best: null, slots: [] }) // the post-update results refresh
    const store = usePollStore()

    await store.update('42', { title: 'New' })

    expect(patch).toHaveBeenCalledWith('/polls/42', { title: 'New' })
    expect(store.currentPoll?.title).toBe('New')
    expect(get).toHaveBeenCalledWith('/public/polls/tok/results')
    expect(store.updateError).toBeNull()
    expect(store.updating).toBe(false)
  })

  it('prefers the server message on a 409 (no longer open) and rethrows', async () => {
    patch.mockRejectedValueOnce(new ApiError(409, { message: 'not open' }))
    const store = usePollStore()

    await expect(store.update('42', { title: 'New' })).rejects.toBeInstanceOf(ApiError)

    expect(store.updateError).toBe('not open')
    expect(store.updating).toBe(false)
  })

  it('takes the first message of a 400 validation array', async () => {
    patch.mockRejectedValueOnce(new ApiError(400, { message: ['title too long', 'x'] }))
    const store = usePollStore()

    await expect(store.update('42', { title: 'New' })).rejects.toBeInstanceOf(ApiError)

    expect(store.updateError).toBe('title too long')
  })

  it('expresses invalidation via the dates[].invalidatedAt marker in the PATCH body', async () => {
    patch.mockResolvedValueOnce({ id: '42', publicToken: 'tok', status: 'open', dates: [] })
    get.mockResolvedValueOnce({ best: null, slots: [] })
    const store = usePollStore()

    const payload = {
      dates: [
        {
          id: '3',
          eventDate: '2026-07-01',
          invalidatedAt: '2026-06-19T00:00:00.000Z',
          slots: [],
        },
      ],
    }
    await store.update('42', payload)

    expect(patch).toHaveBeenCalledWith('/polls/42', payload)
  })
})

describe('pollStore.remove', () => {
  it('DELETEs, drops the row from polls, and clears the detail slice', async () => {
    del.mockResolvedValueOnce(undefined)
    const store = usePollStore()
    store.polls = [{ id: '42' }, { id: '7' }] as unknown as typeof store.polls
    store.currentPoll = { id: '42' } as unknown as typeof store.currentPoll
    store.results = { best: null, slots: [] }
    store.invite = { message: 'hi', shareUrl: 'u' }

    await store.remove('42')

    expect(del).toHaveBeenCalledWith('/polls/42')
    expect(store.polls.map((p) => p.id)).toEqual(['7'])
    expect(store.currentPoll).toBeNull()
    expect(store.results).toBeNull()
    expect(store.invite).toBeNull()
    expect(store.removeError).toBeNull()
    expect(store.removing).toBe(false)
  })

  it('maps a 404 to "This poll no longer exists." and rethrows', async () => {
    del.mockRejectedValueOnce(new ApiError(404, null))
    const store = usePollStore()

    await expect(store.remove('42')).rejects.toBeInstanceOf(ApiError)

    expect(store.removeError).toBe('This poll no longer exists.')
    expect(store.removing).toBe(false)
  })
})

describe('pollStore.cancel / reopen', () => {
  it('cancel POSTs /polls/:id/cancel, swaps in the cancelled poll, and re-fetches results', async () => {
    post.mockResolvedValueOnce({ id: '42', publicToken: 'tok', status: 'cancelled', dates: [] })
    get.mockResolvedValueOnce({ best: null, slots: [] })
    const store = usePollStore()

    await store.cancel('42')

    expect(post).toHaveBeenCalledWith('/polls/42/cancel')
    expect(store.currentPoll?.status).toBe('cancelled')
    expect(get).toHaveBeenCalledWith('/public/polls/tok/results')
    expect(store.lifecycleTransitioning).toBe(false)
  })

  it('reopen POSTs /polls/:id/reopen and reflects the cleared finalSlotId', async () => {
    post.mockResolvedValueOnce({
      id: '42',
      publicToken: 'tok',
      status: 'open',
      finalSlotId: null,
      completedAt: null,
      dates: [],
    })
    get.mockResolvedValueOnce({ best: null, slots: [] })
    const store = usePollStore()

    await store.reopen('42')

    expect(post).toHaveBeenCalledWith('/polls/42/reopen')
    expect(store.currentPoll?.status).toBe('open')
    expect(store.currentPoll?.finalSlotId).toBeNull()
  })

  it('surfaces a 409 as a clean lifecycleError and rethrows', async () => {
    post.mockRejectedValueOnce(new ApiError(409, null))
    const store = usePollStore()

    await expect(store.cancel('42')).rejects.toBeInstanceOf(ApiError)

    expect(store.lifecycleError).toBe('This poll is not in a state that allows that change.')
    expect(store.lifecycleTransitioning).toBe(false)
  })
})
