/**
 * Thin fetch wrapper for the Pollendar API.
 *
 * Every request goes to the `VITE_API_BASE` (`/api`) base with `credentials: "include"` so the
 * httpOnly auth cookie rides along — the SPA never sees or handles the JWT itself. On a non-2xx
 * response it throws a typed {@link ApiError} carrying the HTTP `status`, so callers can branch on
 * `err.status === 401` (no session), `409` (duplicate email/slot), `400` (bad request).
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
 * Fetch `path` (relative to {@link API_BASE}) with cookie credentials and JSON headers.
 * Resolves to the parsed body typed as `T`; throws {@link ApiError} on a non-ok response.
 */
export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
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
