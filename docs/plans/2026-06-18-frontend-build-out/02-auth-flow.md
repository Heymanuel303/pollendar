# Phase 2: Creator auth flow (magic link → session)

**Plan:** [frontend-build-out](00-overview.md)
**Depends on:** 01-scaffold-and-design-system.md
**Execution:** solo

## Context
Pollendar's frontend is a Vue 3.5 + Vite + TypeScript SPA that lets a creator build availability polls and lets participants respond; this phase delivers the passwordless creator auth that gates every authed route. Auth is cookie-based: the SPA never sees the JWT — it requests a magic link, the user clicks the dev link in Mailpit (`http://localhost:8025`), the `/auth/callback` page exchanges the `?token=` for httpOnly `accessToken`/`refreshToken` cookies, and the store hydrates `user` from `GET /api/auth/me`. All UI here is styled with the "Dusk Calendar" design system using Tailwind v4 **CSS-first** tokens (the `@theme` block + `.bg-dusk`/`.pollen-dot`/`.bloom`/`.bloom-bg` helpers) established in phase 1 `src/assets/main.css` — no `tailwind.config.js`, no PostCSS, no v3 `@tailwind` directives. Phase 1 has already scaffolded `main.ts`, `App.vue`, `router/index.ts`, the `api/` fetch client, and `main.css`; this phase fills in the auth slice and the two unauthenticated entry views.

## Objective
Implement creator auth end to end — `authStore` (`user`, `requestLink`, `verify`, `me`, `logout`), the `EmailGate` component, the `Landing` and `AuthCallback` views, router guards for authed routes, and an `/auth/me` bootstrap on app load.

## Files to touch
- `frontend/src/stores/authStore.ts` — **new.** Pinia store: `user: Ref<AuthUser | null>`, `status` (`'idle' | 'loading' | 'ready'`), `isAuthenticated` getter; actions `requestLink(email)`, `verify(token)`, `me()`, `logout()`, `bootstrap()`. All calls go through the `api/` client with `credentials: "include"`.
- `frontend/src/api/auth.ts` — **new** (thin endpoint module over the phase-1 fetch client). `requestMagicLink(email)`, `verify(token)`, `getMe()`, `logout()` returning typed shapes; keep raw `fetch` wiring in the shared client, not in the store.
- `frontend/src/types/auth.ts` — **new.** `AuthUser = { id: string; email: string; displayName: string | null }` (id is a **string** — BigInt is serialized as a string by the backend).
- `frontend/src/components/EmailGate.vue` — **new.** Email-request component (input + "Send magic link" button → success "Check your inbox" state). Reused on Landing and later phases (PollEditor / PublicPoll), so it owns no route logic.
- `frontend/src/views/Landing.vue` — **new.** Pitch page (`/`) composing the brand header, hero copy, `EmailGate`, reassurance line, and the decorative constellation preview.
- `frontend/src/views/AuthCallback.vue` — **new.** Transient page (`/auth/callback`): reads `?token=`, POSTs verify, redirects to `/dashboard`; shows an error state on 401/invalid.
- `frontend/src/router/index.ts` — **edit** (created in phase 1): register `/` → `Landing` and `/auth/callback` → `AuthCallback`, mark authed routes with `meta: { requiresAuth: true }`, and add a `beforeEach` guard that runs the one-time `bootstrap()` then redirects unauthenticated users to `/`.
- `frontend/src/main.ts` — **edit** (created in phase 1): nothing structural; `bootstrap()` is invoked from the guard (or an `app.mount`-adjacent `await`) — confirm Pinia is installed before the router so the guard can read the store.

## Steps
1. **Types.** Create `frontend/src/types/auth.ts` exporting `AuthUser = { id: string; email: string; displayName: string | null }`. Note `displayName` can be `null` (backend defaults it to `email.split('@')[0]` on upsert but the wire type is nullable) — UI must fall back to `email` when rendering.
2. **API module.** Create `frontend/src/api/auth.ts` over the phase-1 fetch client (which sets `credentials: "include"` and the `/api` base on every call):
   - `requestMagicLink(email: string): Promise<{ ok: true }>` → `POST /api/auth/magic-link`, body `{ email }`. **Always resolves 200** (anti-enumeration); only network/5xx errors reject. Throttled server-side to 5/60s.
   - `verify(token: string): Promise<{ user: AuthUser }>` → `POST /api/auth/verify`, body `{ token }`. Returns `{ user }` and sets the httpOnly cookies in the response; a 401 (invalid/expired token) must surface a distinguishable error.
   - `getMe(): Promise<AuthUser>` → `GET /api/auth/me`. 200 → `AuthUser`; 401 → treated as "no session" (return/throw a typed `Unauthorized` the store maps to `user = null`, not a hard error).
   - `logout(): Promise<{ ok: true }>` → `POST /api/auth/logout`. Idempotent — 200 even with no session.
   - Do **not** add a verify/me query string; the only body field for verify is `{ token }` (see backend `VerifyDto`).
3. **authStore.** Create `frontend/src/stores/authStore.ts` (`defineStore('auth', () => { ... })` setup style):
   - State: `user = ref<AuthUser | null>(null)`, `status = ref<'idle' | 'loading' | 'ready'>('idle')`, `bootstrapped = ref(false)`.
   - `isAuthenticated = computed(() => user.value !== null)`.
   - `requestLink(email)` → `await authApi.requestMagicLink(email)`; never throws on unknown email; the calling component owns the "check your inbox" UI state.
   - `verify(token)` → `const { user: u } = await authApi.verify(token); user.value = u`. On 401, leave `user` null and rethrow so `AuthCallback` shows the error state.
   - `me()` → `status='loading'`; on 200 set `user`, on 401 set `user = null`; always end `status='ready'`.
   - `logout()` → `await authApi.logout(); user.value = null` (clear regardless of result).
   - `bootstrap()` → idempotent: if `bootstrapped.value` return; else `await me()` then `bootstrapped.value = true`. This restores the session on a hard refresh via the existing cookie.
4. **EmailGate component.** Create `frontend/src/components/EmailGate.vue` from the `form-fields.html` / `landing.html` EmailGate pattern. Two visual states:
   - **Request state:** a `<form @submit.prevent="submit">` with an `<input type="email" required>` (`placeholder="you@work.com"`, classes `rounded-xl border border-line bg-canvas px-4 py-3 text-moonlight placeholder:text-mute focus:border-pollen focus:outline-none focus:ring-2 focus:ring-pollen/30`) and a submit `<button>` (`rounded-xl bg-pollen px-4 py-3 font-medium text-canvas shadow-glow transition hover:brightness-110 active:translate-y-px`) reading "Send magic link". Helper text below: "No password. We'll email you a magic link." (`text-sm text-mute`).
   - **Success state:** on submit call `authStore.requestLink(email)`; regardless of outcome (anti-enumeration) swap to a confirmation block — heading "Check your inbox" with a mint/pollen accent and a "request again" reset link that returns to the request state. Disable the button while the request is in flight; surface only genuine network failures (e.g. "Couldn't reach the server — try again").
   - Props: `submitLabel?: string` (default "Send magic link"), `helperText?: string`. No router coupling so it can be reused in PollEditor/PublicPoll later.
5. **Landing view.** Create `frontend/src/views/Landing.vue` (`/`) from `docs/design/mockups/screens/landing.html`:
   - Sticky brand header: P mark `grid h-8 w-8 place-items-center rounded-xl bg-pollen font-display text-base font-bold text-canvas shadow-glow`, wordmark "Pollendar" in `font-display`, a "Sign in" affordance.
   - Hero: eyebrow "Availability polling, in bloom" (`text-xs uppercase tracking-widest text-mute`), `font-display` title "Find the time everyone can make.", supporting paragraph, then `<EmailGate />`, then the reassurance row — three `.pollen-dot` spans + "Takes about a minute." (`text-sm text-mute`).
   - Decorative constellation preview card on the right, `lg:`-only (`hidden lg:block` wrapper), ported from the landing mockup (this is static/illustrative — no live data this phase).
   - Page root uses `bg-dusk text-moonlight min-h-screen` (the `.bg-dusk` helper from phase-1 `main.css`).
6. **AuthCallback view.** Create `frontend/src/views/AuthCallback.vue` (`/auth/callback`):
   - On `onMounted`: read `route.query.token` (string | undefined). If missing → error state "This link is missing its token."
   - Else `try { await authStore.verify(token); router.replace('/dashboard') } catch { errorState }`. The verify can be 401 (expired/invalid — magic-link TTL is 15m) → show "This link has expired or was already used." with a button linking back to `/` to request a new one. **Never** leave a blank loader on failure.
   - While verifying, show a centered loading state (a `.bloom` pollen mark + "Signing you in…"). Because cookies are `SameSite=Lax`, this exchange runs as a normal in-page XHR after the browser navigated here from the email link — correct per the flow; do not pre-navigate elsewhere.
7. **Router + guard.** Edit `frontend/src/router/index.ts`:
   - Add routes: `{ path: '/', name: 'landing', component: Landing }`, `{ path: '/auth/callback', name: 'auth-callback', component: AuthCallback }`. Lazy-load views with dynamic `import()`.
   - Tag authed routes (e.g. `/dashboard`, `/polls/new`, `/polls/:id` — placeholders this phase if not yet built) with `meta: { requiresAuth: true }`.
   - `router.beforeEach(async (to) => { const auth = useAuthStore(); await auth.bootstrap(); if (to.meta.requiresAuth && !auth.isAuthenticated) return { name: 'landing' }; })`. `bootstrap()` is idempotent so the `/auth/me` probe runs once per app load.
8. **App-load bootstrap wiring.** In `frontend/src/main.ts`, ensure `app.use(pinia)` precedes `app.use(router)` so the guard can resolve `useAuthStore()`. The guard's first `bootstrap()` call performs the `/auth/me` session-restore on initial load — no separate top-level `await` is required, but confirm the very first navigation awaits it.

## Verification
- `cd frontend && npm run build` (or the `vue-tsc --noEmit` typecheck script the create-vue scaffold from phase 1 generates, e.g. `npm run type-check`) passes with no TS errors — all ids typed as `string`, `displayName` handled as nullable.
- `cd frontend && npm run lint` passes (the ESLint script create-vue scaffolds) — confirm the exact script name from phase 1's generated `package.json`.
- Component/unit tests added in THIS phase (Vitest + @vue/test-utils, the runner phase 1 set up):
  - `EmailGate.spec.ts`: submitting calls `authStore.requestLink` with the typed email and swaps to the "Check your inbox" state; an empty/invalid email is blocked by the native `required`/`type=email` and does not call the store; the "request again" reset link returns to the request state.
  - `authStore.spec.ts`: `verify(token)` populates `user` on a mocked 200 and leaves `user` null + rethrows on a mocked 401; `me()` sets `user` on 200 and clears it on 401 while always reaching `status='ready'`; `bootstrap()` calls `me()` at most once across repeated invocations; `logout()` clears `user` even if the request rejects.
  - `AuthCallback.spec.ts`: a missing `?token=` renders the error state without calling verify; a rejected `verify` renders the expired-link error (not a blank loader); a resolved `verify` calls `router.replace('/dashboard')`.
- Manual UI check against `docs/design/mockups/screens/landing.html`: hero, `EmailGate`, three `.pollen-dot` reassurance dots, and the `lg:`-only constellation preview match; the `EmailGate` request→"Check your inbox" swap matches the `form-fields.html` inline EmailGate styling (pollen button, `focus:ring-pollen/30` input). Manually exercise the full loop against the running backend: submit on Landing → open the magic link in Mailpit (`http://localhost:8025`) → land on `/auth/callback` → redirect to `/dashboard`; a hard refresh keeps the session (cookie + `/auth/me`); "Sign in / logout" clears it.

## Acceptance
- [ ] Requesting a magic link from Landing always shows "Check your inbox" (even for an unknown email) and the dev link arrives in Mailpit.
- [ ] Visiting `/auth/callback?token=<valid>` verifies, sets the session, and redirects to `/dashboard`; an invalid/expired token shows the expired-link error, never a blank loader.
- [ ] A hard refresh on an authed route keeps the user signed in (session restored via the `/auth/me` bootstrap); after `logout()` the same route redirects to `/`.
- [x] No JWT is ever read by JS — all four auth calls use `credentials:"include"` and the store holds only `{ id, email, displayName }` with `id` typed as `string`.
- [x] `npm run build`/type-check and `npm run lint` pass, and the three new spec files are green.
