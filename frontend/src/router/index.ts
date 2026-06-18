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
  ],
})

// Restore the session once per app load (the cookie + `/auth/me`), then gate authed routes.
// `bootstrap()` is idempotent, so the `/auth/me` probe runs on the first navigation only.
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.bootstrap()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'landing' }
  }
})

export default router
