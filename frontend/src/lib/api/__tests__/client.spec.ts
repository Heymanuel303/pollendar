import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiFetch, ApiError, API_BASE, setUnauthorizedHandler } from '../client'

type Res = { ok: boolean; status: number; bodyText?: string }
const asResponse = (r: Res) => ({ ok: r.ok, status: r.status, text: async () => r.bodyText ?? '' }) as Response

function mockFetch(opts: Res) {
  const fn = vi
    .fn<(url: string, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(asResponse(opts))
  vi.stubGlobal('fetch', fn)
  return fn
}

/** Resolve the queued responses in order, one per `fetch` call. */
function mockFetchSequence(responses: Res[]) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
  for (const r of responses) fn.mockResolvedValueOnce(asResponse(r))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  setUnauthorizedHandler(null)
})

describe('apiFetch', () => {
  it('prefixes the /api base and sends cookie credentials + JSON headers', async () => {
    const fetchFn = mockFetch({ ok: true, status: 200, bodyText: JSON.stringify({ id: '1' }) })
    const result = await apiFetch<{ id: string }>('/auth/me')

    expect(API_BASE).toBe('/api')
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
    expect(result).toEqual({ id: '1' })
  })

  it('throws a typed ApiError carrying the status and parsed body on a non-ok response', async () => {
    mockFetch({ ok: false, status: 409, bodyText: JSON.stringify({ message: 'duplicate' }) })

    const err = (await apiFetch('/public/polls/x/responses', { method: 'POST' }).catch(
      (e) => e,
    )) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.body).toEqual({ message: 'duplicate' })
  })

  it('distinguishes a 401 (no session) from other failures', async () => {
    mockFetch({ ok: false, status: 401, bodyText: '' })
    const err = (await apiFetch('/auth/me').catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
  })

  it('tolerates an empty 204 body', async () => {
    mockFetch({ ok: true, status: 204, bodyText: '' })
    await expect(apiFetch('/polls/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})

describe('apiFetch — transparent session refresh', () => {
  it('refreshes once and replays the original request on a mid-session 401', async () => {
    const fetchFn = mockFetchSequence([
      { ok: false, status: 401, bodyText: '' }, // GET /polls → access token lapsed
      { ok: true, status: 200, bodyText: JSON.stringify({ ok: true }) }, // POST /auth/refresh
      { ok: true, status: 200, bodyText: JSON.stringify([{ id: '1' }]) }, // GET /polls replay
    ])

    const result = await apiFetch('/polls')

    expect(result).toEqual([{ id: '1' }])
    expect(fetchFn).toHaveBeenCalledTimes(3)
    const refreshCall = fetchFn.mock.calls[1]
    expect(refreshCall?.[0]).toBe('/api/auth/refresh')
    expect(refreshCall?.[1]).toEqual(expect.objectContaining({ method: 'POST' }))
  })

  it('de-duplicates concurrent 401s into a single /auth/refresh (single-flight)', async () => {
    let refreshCalls = 0
    const fn = vi.fn(async (url: string) => {
      if (url === '/api/auth/refresh') {
        refreshCalls += 1
        return asResponse({ ok: true, status: 200, bodyText: '{"ok":true}' })
      }
      // Data endpoints 401 until a refresh has happened, then succeed on replay.
      return refreshCalls === 0
        ? asResponse({ ok: false, status: 401, bodyText: '' })
        : asResponse({ ok: true, status: 200, bodyText: JSON.stringify({ url }) })
    })
    vi.stubGlobal('fetch', fn)

    const [a, b] = await Promise.all([apiFetch('/polls'), apiFetch('/notifications')])

    expect(refreshCalls).toBe(1) // exactly one refresh despite two concurrent 401s
    expect(a).toEqual({ url: '/api/polls' })
    expect(b).toEqual({ url: '/api/notifications' })
  })

  it('surfaces the 401 and notifies the unauthorized handler when the refresh itself fails', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    mockFetchSequence([
      { ok: false, status: 401, bodyText: '' }, // GET /polls → 401
      { ok: false, status: 401, bodyText: '' }, // POST /auth/refresh → refresh cookie gone
    ])

    const err = (await apiFetch('/polls').catch((e) => e)) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('does not refresh-retry the /auth/me probe (a 401 there means "no session")', async () => {
    const fetchFn = mockFetch({ ok: false, status: 401, bodyText: '' })

    const err = (await apiFetch('/auth/me').catch((e) => e)) as ApiError

    expect(err.status).toBe(401)
    expect(fetchFn).toHaveBeenCalledTimes(1) // no /auth/refresh attempted
  })
})
