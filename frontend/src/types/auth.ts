/**
 * The authenticated creator, as returned by `POST /api/auth/verify` (`{ user }`) and `GET /api/auth/me`.
 *
 * `id` is a **string** — the backend serializes its BigInt ids as strings. `displayName` is nullable
 * on the wire (the backend defaults it to `email.split('@')[0]` on upsert, but the type permits null),
 * so the UI must fall back to `email` when rendering a name.
 */
export interface AuthUser {
  id: string
  email: string
  displayName: string | null
}
