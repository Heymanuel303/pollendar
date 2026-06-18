import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ApiError } from '@/lib/api/client'

// Stub the endpoint module so the store is exercised against controlled resolutions/rejections.
const api = vi.hoisted(() => ({
  requestMagicLink: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  verify: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getMe: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  logout: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/api/auth', () => api)

import { useAuthStore } from '../authStore'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('authStore', () => {
  it('verify populates user on a 200', async () => {
    api.verify.mockResolvedValue({ user: { id: '7', email: 'a@b.com', displayName: null } })
    const store = useAuthStore()

    await store.verify('tok')

    expect(api.verify).toHaveBeenCalledWith('tok')
    expect(store.user).toEqual({ id: '7', email: 'a@b.com', displayName: null })
    expect(store.isAuthenticated).toBe(true)
  })

  it('verify leaves user null and rethrows on a 401', async () => {
    api.verify.mockRejectedValue(new ApiError(401, { message: 'invalid token' }))
    const store = useAuthStore()

    await expect(store.verify('expired')).rejects.toBeInstanceOf(ApiError)
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('me sets user on a 200 and always reaches ready', async () => {
    api.getMe.mockResolvedValue({ id: '1', email: 'a@b.com', displayName: 'Ada' })
    const store = useAuthStore()

    await store.me()

    expect(store.user).toEqual({ id: '1', email: 'a@b.com', displayName: 'Ada' })
    expect(store.status).toBe('ready')
  })

  it('me clears user on a 401 and still reaches ready', async () => {
    api.getMe.mockRejectedValue(new ApiError(401, null))
    const store = useAuthStore()

    await store.me()

    expect(store.user).toBeNull()
    expect(store.status).toBe('ready')
  })

  it('me rethrows a non-401 error (still ready)', async () => {
    api.getMe.mockRejectedValue(new ApiError(500, null))
    const store = useAuthStore()

    await expect(store.me()).rejects.toBeInstanceOf(ApiError)
    expect(store.status).toBe('ready')
  })

  it('bootstrap calls me at most once across repeated invocations', async () => {
    api.getMe.mockResolvedValue({ id: '1', email: 'a@b.com', displayName: null })
    const store = useAuthStore()

    await store.bootstrap()
    await store.bootstrap()
    await store.bootstrap()

    expect(api.getMe).toHaveBeenCalledTimes(1)
    expect(store.bootstrapped).toBe(true)
  })

  it('logout clears user even if the request rejects', async () => {
    api.getMe.mockResolvedValue({ id: '1', email: 'a@b.com', displayName: null })
    const store = useAuthStore()
    await store.me()
    expect(store.user).not.toBeNull()

    api.logout.mockRejectedValue(new Error('network down'))
    await store.logout()

    expect(store.user).toBeNull()
  })
})
