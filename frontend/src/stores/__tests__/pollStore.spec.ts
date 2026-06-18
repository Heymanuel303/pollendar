import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Stub the client's `get` so list() is exercised against controlled resolutions/rejections.
const { get } = vi.hoisted(() => ({
  get: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
}))
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return { ...actual, get }
})

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
