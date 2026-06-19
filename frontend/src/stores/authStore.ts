import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'
import { ApiError, refreshSession } from '@/lib/api/client'
import type { AuthUser } from '@/types/auth'

/** App-load lifecycle of the session probe: idle → loading (during `/auth/me`) → ready. */
export type AuthStatus = 'idle' | 'loading' | 'ready'

/**
 * Creator session store. Holds only the sanitized `{ id, email, displayName }` (never the JWT —
 * that lives in an httpOnly cookie). `bootstrap()` restores the session once on app load via the
 * cookie + `/auth/me`; the router guard awaits it before gating authed routes.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const status = ref<AuthStatus>('idle')
  const bootstrapped = ref(false)

  const isAuthenticated = computed(() => user.value !== null)

  /**
   * Request a magic link. Never throws on an unknown email (anti-enumeration), the calling
   * component owns the "check your inbox" UI; only a genuine network/5xx failure rejects.
   */
  async function requestLink(email: string): Promise<void> {
    await authApi.requestMagicLink(email)
  }

  /**
   * Exchange a magic-link token for a session. On success sets `user`; on a 401 (invalid/expired)
   * leaves `user` null and rethrows so `AuthCallback` can show its expired-link state.
   */
  async function verify(token: string): Promise<void> {
    const { user: u } = await authApi.verify(token)
    user.value = u
  }

  /**
   * Probe the session cookie via `/auth/me`: 200 sets `user`, a 401 clears it (no session). Any
   * other error propagates. Always ends `status = 'ready'`.
   */
  async function me(): Promise<void> {
    status.value = 'loading'
    try {
      user.value = await authApi.getMe()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        user.value = null
      } else {
        throw err
      }
    } finally {
      status.value = 'ready'
    }
  }

  /** Clear the session. Best-effort + idempotent: clears `user` even if the request rejects. */
  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch {
      // Logout is idempotent; clear the local session regardless of the server's response.
    }
    user.value = null
  }

  /**
   * Drop the in-memory session without calling the server. Used when a transparent refresh fails
   * (the refresh cookie is already gone) so `isAuthenticated` can't get stuck stale-true on an
   * authed page after the session has actually died.
   */
  function clearSession(): void {
    user.value = null
  }

  /**
   * Revive an expired access token from the refresh cookie, then re-probe `/auth/me`. Returns
   * whether a session was restored. The router guard calls this when an authed route is entered
   * with no in-memory session (e.g. a full reload after the access token lapsed) so a still-valid
   * refresh cookie restores the session instead of bouncing the user to the landing page.
   */
  async function tryRefresh(): Promise<boolean> {
    try {
      await refreshSession()
    } catch {
      return false
    }
    await me()
    return isAuthenticated.value
  }

  /**
   * One-time session restore on app load: runs the `/auth/me` probe exactly once across repeated
   * calls (the guard fires `beforeEach`, but the cookie only needs reading once per app load).
   */
  async function bootstrap(): Promise<void> {
    if (bootstrapped.value) return
    await me()
    bootstrapped.value = true
  }

  return {
    user,
    status,
    bootstrapped,
    isAuthenticated,
    requestLink,
    verify,
    me,
    logout,
    clearSession,
    tryRefresh,
    bootstrap,
  }
})
