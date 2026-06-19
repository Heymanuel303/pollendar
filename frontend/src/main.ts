// Self-hosted fonts (no Google Fonts CDN): Space Grotesk (display + numerals) and Inter (body).
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'

import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from '@/lib/api/client'
import { useAuthStore } from '@/stores/authStore'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// When a mid-session request can't be refreshed (the refresh cookie is gone/expired), drop the
// local session so `isAuthenticated` doesn't stay stale-true, and — only if the user is currently
// on an authed route — send them to the landing page for a clean re-login.
setUnauthorizedHandler(() => {
  useAuthStore().clearSession()
  if (router.currentRoute.value.meta.requiresAuth) {
    void router.push({ name: 'landing' })
  }
})

app.mount('#app')
