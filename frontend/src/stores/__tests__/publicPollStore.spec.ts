import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ApiError } from '@/lib/api/client'

// Stub the public-poll api module so the store is exercised against controlled resolutions/rejections.
const { getPublicPoll, submitResponses, getResults, getParticipantResponses } = vi.hoisted(() => ({
  getPublicPoll: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  submitResponses: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getResults: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getParticipantResponses: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/lib/api/public-poll', () => ({
  getPublicPoll,
  submitResponses,
  getResults,
  getParticipantResponses,
}))

// Stub the participant-token helper to assert persistence without touching real localStorage.
const { saveParticipantToken } = vi.hoisted(() => ({
  saveParticipantToken: vi.fn<(...args: unknown[]) => void>(),
}))
vi.mock('@/lib/participantToken', () => ({ saveParticipantToken }))

import { usePublicPollStore } from '../publicPollStore'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('publicPollStore.load', () => {
  it('populates poll on success and marks the load successful', async () => {
    getPublicPoll.mockResolvedValue({
      id: '1',
      title: 'Dinner',
      timezone: 'Europe/Brussels',
      dates: [],
    })
    const store = usePublicPollStore()

    await store.load('share-token')

    expect(getPublicPoll).toHaveBeenCalledWith('share-token')
    expect(store.poll).toMatchObject({ id: '1', title: 'Dinner' })
    expect(store.loadState).toBe('success')
  })

  it('clears poll and records the error code on a 404', async () => {
    getPublicPoll.mockRejectedValue(new ApiError(404, { message: 'Not Found' }))
    const store = usePublicPollStore()

    await store.load('nope')

    expect(store.poll).toBeNull()
    expect(store.loadState).toBe('error')
    expect(store.errorCode).toBe(404)
  })
})

describe('publicPollStore.submit', () => {
  it('persists the returned participant token on 201 and resolves with it', async () => {
    submitResponses.mockResolvedValue({ publicToken: 'participant-edit-token' })
    const store = usePublicPollStore()

    const token = await store.submit('share-token', {
      displayName: 'Sam',
      answers: [{ pollSlotId: '9', availability: 'available' }],
    })

    expect(token).toBe('participant-edit-token')
    expect(saveParticipantToken).toHaveBeenCalledWith('share-token', 'participant-edit-token')
    expect(store.submitState).toBe('success')
    expect(store.errorCode).toBeNull()
  })

  it('on a 409 sets errorCode + the server message and does NOT persist a token', async () => {
    const serverMessage = 'A participant with this email already responded to this poll'
    submitResponses.mockRejectedValue(new ApiError(409, { message: serverMessage }))
    const store = usePublicPollStore()

    await expect(
      store.submit('share-token', {
        displayName: 'Sam',
        email: 'sam@example.com',
        answers: [{ pollSlotId: '9', availability: 'available' }],
      }),
    ).rejects.toBeInstanceOf(ApiError)

    expect(store.errorCode).toBe(409)
    expect(store.errorMessage).toBe(serverMessage)
    expect(store.submitState).toBe('error')
    expect(saveParticipantToken).not.toHaveBeenCalled()
  })
})

describe('publicPollStore.loadResults', () => {
  it('populates results on success', async () => {
    getResults.mockResolvedValue({
      best: { slotId: '9', date: '2026-06-26', label: 'Early', score: 6 },
      slots: [],
    })
    const store = usePublicPollStore()

    await store.loadResults('share-token')

    expect(getResults).toHaveBeenCalledWith('share-token')
    expect(store.results?.best?.slotId).toBe('9')
  })

  it('leaves results null and is non-fatal when the fetch fails', async () => {
    getResults.mockRejectedValue(new ApiError(404, { message: 'Not Found' }))
    const store = usePublicPollStore()

    await store.loadResults('nope')

    expect(store.results).toBeNull()
  })
})

describe('publicPollStore.loadParticipants', () => {
  it('calls getParticipantResponses with (token, limit, offset) and populates the rows on success', async () => {
    getParticipantResponses.mockResolvedValue({
      participants: [
        {
          participantId: '5',
          displayName: 'Sam',
          answers: [{ pollSlotId: '9', availability: 'available' }],
        },
      ],
      total: 12,
      hasMore: true,
    })
    const store = usePublicPollStore()

    await store.loadParticipants('share-token', { limit: 10, offset: 0 })

    expect(getParticipantResponses).toHaveBeenCalledWith('share-token', 10, 0)
    expect(store.participants).toHaveLength(1)
    expect(store.participants[0]).toMatchObject({ participantId: '5', displayName: 'Sam' })
    expect(store.participantsTotal).toBe(12)
    expect(store.participantsHasMore).toBe(true)
    expect(store.participantsState).toBe('success')
  })

  it('passes undefined limit/offset when no opts are given', async () => {
    getParticipantResponses.mockResolvedValue({ participants: [], total: 0, hasMore: false })
    const store = usePublicPollStore()

    await store.loadParticipants('share-token')

    expect(getParticipantResponses).toHaveBeenCalledWith('share-token', undefined, undefined)
  })

  it('clears the rows and is non-fatal (does NOT throw) on a 404', async () => {
    getParticipantResponses.mockRejectedValue(new ApiError(404, { message: 'Not Found' }))
    const store = usePublicPollStore()

    await expect(store.loadParticipants('nope')).resolves.toBeUndefined()

    expect(store.participants).toEqual([])
    expect(store.participantsTotal).toBe(0)
    expect(store.participantsHasMore).toBe(false)
    expect(store.participantsState).toBe('error')
    expect(store.errorCode).toBe(404)
  })
})

describe('publicPollStore.loadDetail', () => {
  it('fetches the poll then hydrates results + participants in one call', async () => {
    getPublicPoll.mockResolvedValue({
      id: '1',
      title: 'Dinner',
      timezone: 'Europe/Brussels',
      dates: [],
    })
    getResults.mockResolvedValue({
      best: { slotId: '9', date: '2026-06-26', label: 'Early', score: 6 },
      slots: [],
    })
    getParticipantResponses.mockResolvedValue({
      participants: [{ participantId: '5', displayName: 'Sam', answers: [] }],
      total: 1,
      hasMore: false,
    })
    const store = usePublicPollStore()

    await store.loadDetail('share-token')

    expect(getPublicPoll).toHaveBeenCalledWith('share-token')
    expect(getResults).toHaveBeenCalledWith('share-token')
    expect(getParticipantResponses).toHaveBeenCalledWith('share-token', undefined, undefined)
    expect(store.poll).toMatchObject({ id: '1', title: 'Dinner' })
    expect(store.results?.best?.slotId).toBe('9')
    expect(store.participants).toHaveLength(1)
    expect(store.loadState).toBe('success')
  })

  it('still resolves the poll when the derived loads fail (non-fatal)', async () => {
    getPublicPoll.mockResolvedValue({
      id: '1',
      title: 'Dinner',
      timezone: 'Europe/Brussels',
      dates: [],
    })
    getResults.mockRejectedValue(new ApiError(404, { message: 'Not Found' }))
    getParticipantResponses.mockRejectedValue(new ApiError(404, { message: 'Not Found' }))
    const store = usePublicPollStore()

    await expect(store.loadDetail('share-token')).resolves.toBeUndefined()

    expect(store.poll).toMatchObject({ id: '1' })
    expect(store.loadState).toBe('success')
    expect(store.results).toBeNull()
    expect(store.participants).toEqual([])
  })

  it('clears the poll and records the error when the poll fetch 404s', async () => {
    getPublicPoll.mockRejectedValue(new ApiError(404, { message: 'Not Found' }))
    getResults.mockResolvedValue({ best: null, slots: [] })
    getParticipantResponses.mockResolvedValue({ participants: [], total: 0, hasMore: false })
    const store = usePublicPollStore()

    await store.loadDetail('nope')

    expect(store.poll).toBeNull()
    // `loadState` (set by `load`) is the durable failure signal: the derived loaders never touch it.
    expect(store.loadState).toBe('error')
    // `errorCode` is NOT a reliable post-orchestrator signal here — the subsequent successful
    // `loadParticipants` calls `resetError()`, so the 404 recorded by `load` is cleared back to null.
    expect(store.errorCode).toBeNull()
  })
})
