import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('@/views/Landing.vue'),
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('@/views/AuthCallback.vue'),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/Dashboard.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/polls/new',
      name: 'poll-new',
      component: () => import('@/views/PollEditor.vue'),
      meta: { requiresAuth: true },
    },
    {
      // Reuses PollEditor.vue in edit mode (it branches on the presence of `route.params.id`).
      // `/polls/:id/edit` is a distinct path segment from `/polls/:id`, so there is no ambiguity
      // with `poll-manage` and ordering relative to it does not matter.
      path: '/polls/:id/edit',
      name: 'poll-edit',
      component: () => import('@/views/PollEditor.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/polls/:id',
      name: 'poll-manage',
      component: () => import('@/views/PollManage.vue'),
      meta: { requiresAuth: true },
    },
    // Anonymous participant flow — no auth, and `public: true` so App.vue renders the minimal
    // wordmark-only layout (no creator app nav) for these full-bleed views.
    {
      path: '/p/:publicToken',
      name: 'public-poll',
      component: () => import('@/views/PublicPoll.vue'),
      meta: { public: true },
    },
    {
      path: '/p/:publicToken/done',
      name: 'public-thanks',
      component: () => import('@/views/PublicThanks.vue'),
      meta: { public: true },
    },
  ],
})

// Restore the session once per app load (the cookie + `/auth/me`), then gate authed routes.
// `bootstrap()` is idempotent, so the `/auth/me` probe runs on the first navigation only.
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.bootstrap()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    // The access token may have lapsed while the long-lived refresh cookie is still valid (e.g. a
    // full reload after the access TTL elapsed). Try one refresh before bouncing to the landing page.
    if (await auth.tryRefresh()) return
    return { name: 'landing' }
  }
})

export default router
