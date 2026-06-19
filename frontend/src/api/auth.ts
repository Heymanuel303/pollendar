/**
 * Auth endpoint module, thin typed wrappers over the shared fetch client. The raw `fetch` wiring
 * (the `/api` base + `credentials: "include"` so the httpOnly cookie rides along, and the typed
 * {@link ApiError} on a non-2xx response) lives in `@/lib/api/client`; the store calls these, never
 * `fetch` directly. The SPA never reads the JWT, `verify` sets httpOnly cookies server-side.
 */
import { get, post } from '@/lib/api/client'
import type { AuthUser } from '@/types/auth'

/**
 * `POST /api/auth/magic-link`. Always resolves `{ ok: true }` regardless of whether the email maps
 * to an account (anti-enumeration); only a network/5xx failure rejects. Throttled server-side to 5/60s.
 */
export function requestMagicLink(email: string): Promise<{ ok: true }> {
  return post<{ ok: true }>('/auth/magic-link', { email })
}

/**
 * `POST /api/auth/verify`. Exchanges a single-use magic-link token for the session: the response sets
 * httpOnly access + refresh cookies and returns `{ user }`. A 401 (invalid/expired token, 15m TTL)
 * rejects with {@link ApiError} so callers can surface a distinguishable error.
 */
export function verify(token: string): Promise<{ user: AuthUser }> {
  return post<{ user: AuthUser }>('/auth/verify', { token })
}

/**
 * `GET /api/auth/me`. 200 → the current {@link AuthUser}; 401 rejects with {@link ApiError} (status
 * 401), which the store maps to "no session" (`user = null`) rather than a hard error.
 */
export function getMe(): Promise<AuthUser> {
  return get<AuthUser>('/auth/me')
}

/** `POST /api/auth/logout`. Idempotent, 200 even with no session; clears the cookies server-side. */
export function logout(): Promise<{ ok: true }> {
  return post<{ ok: true }>('/auth/logout')
}

/**
 * `POST /api/auth/refresh`. Rotates the refresh session and reissues both httpOnly cookies. 200 →
 * the session is alive; a 401 (missing/expired/rotated refresh cookie) rejects with {@link ApiError}.
 * The client wrapper calls this transparently on a mid-session 401, components rarely call it directly.
 */
export function refresh(): Promise<{ ok: true }> {
  return post<{ ok: true }>('/auth/refresh')
}
