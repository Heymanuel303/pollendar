import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Stub the client's `get`/`post` so the store's actions are exercised against controlled
// resolutions/rejections. `ApiError` is the real class (preserved via the spread) so the store's
// `err instanceof ApiError` status branching is tested faithfully.
const { get, post } = vi.hoisted(() => ({
  get: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
  post: vi.fn<(path: string, body?: unknown, init?: RequestInit) => Promise<unknown>>(),
}))
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return { ...actual, get, post }
})

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
