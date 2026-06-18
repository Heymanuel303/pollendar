import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiFetch, ApiError, API_BASE } from '../client'

function mockFetch(opts: { ok: boolean; status: number; bodyText?: string }) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>().mockResolvedValue({
    ok: opts.ok,
    status: opts.status,
    text: async () => opts.bodyText ?? '',
  } as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
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
