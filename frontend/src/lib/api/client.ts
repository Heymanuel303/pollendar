/**
 * Thin fetch wrapper for the Pollendar API.
 *
 * Every request goes to the `VITE_API_BASE` (`/api`) base with `credentials: "include"` so the
 * httpOnly auth cookie rides along, the SPA never sees or handles the JWT itself. On a non-2xx
 * response it throws a typed {@link ApiError} carrying the HTTP `status`, so callers can branch on
 * `err.status === 401` (no session), `409` (duplicate email/slot), `400` (bad request).
 *
 * When the short-lived access token lapses mid-session, a guarded request 401s; the wrapper then
 * transparently rotates the session via `POST /auth/refresh` (single-flight) and replays the
 * request once, so the long-lived refresh cookie keeps the user logged in without a visible logout.
 */

export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

/** Error thrown for any non-2xx API response. `body` is the parsed JSON (or text) payload. */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function parseBody(res: Response): Promise<unknown> {
  // 204 No Content (and other empty bodies) have nothing to parse.
  if (res.status === 204) return undefined
  const text = await res.text()
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Endpoints a 401 must NOT try to refresh-and-retry: the refresh call itself (would recurse), the
 * unauthenticated entry points, and the `/auth/me` probe, its 401 means "no session", which
 * `authStore.bootstrap()` handles, and auto-refreshing it would add a wasted call to every
 * anonymous public-poll visit. Session restore for those cases lives in the router guard.
 */
const NON_REFRESHABLE = [
  '/auth/refresh',
  '/auth/verify',
  '/auth/magic-link',
  '/auth/logout',
  '/auth/me',
]

function isRefreshable(path: string): boolean {
  return !NON_REFRESHABLE.some(
    (p) => path === p || path.startsWith(`${p}?`) || path.startsWith(`${p}/`),
  )
}

/** In-flight refresh shared across concurrent 401s (see {@link refreshSession}); null when idle. */
let refreshing: Promise<void> | null = null

/**
 * Rotate the session via `POST /auth/refresh`, de-duplicated so N concurrent 401s fire exactly one
 * refresh. This single-flight is essential: refresh tokens rotate server-side, so a racing second
 * call would present an already-revoked token and force a logout. Resolves on success; rejects (and
 * resets, so the next 401 can retry) when the session can no longer be refreshed.
 */
export function refreshSession(): Promise<void> {
  refreshing ??= apiFetch<{ ok: true }>('/auth/refresh', { method: 'POST' }, { retry: false })
    .then(() => undefined)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

/** Invoked when a session can't be refreshed (clear store + redirect). Wired in `main.ts`. */
let onUnauthorized: (() => void) | null = null

/** Register the unauthorized handler. Pass `null` to clear (used in tests). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

/**
 * Fetch `path` (relative to {@link API_BASE}) with cookie credentials and JSON headers.
 * Resolves to the parsed body typed as `T`; throws {@link ApiError} on a non-ok response.
 * On a 401 for a refreshable endpoint it rotates the session once and replays the request;
 * `opts.retry === false` marks the replayed (or refresh) call so it never loops.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
  opts: { retry?: boolean } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const body = await parseBody(res)
  if (!res.ok) {
    if (res.status === 401 && opts.retry !== false && isRefreshable(path)) {
      try {
        await refreshSession()
      } catch {
        // The refresh cookie is gone/expired: the session is truly over.
        onUnauthorized?.()
        throw new ApiError(res.status, body)
      }
      return apiFetch<T>(path, init, { retry: false })
    }
    throw new ApiError(res.status, body)
  }
  return body as T
}

/** GET `path`. */
export function get<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: 'GET' })
}

/** POST `path` with an optional JSON body. */
export function post<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** PATCH `path` with an optional JSON body. */
export function patch<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** DELETE `path`. */
export function del<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: 'DELETE' })
}
