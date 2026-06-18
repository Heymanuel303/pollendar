<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

// Transient page (`/auth/callback`): the browser lands here from the email link with `?token=`.
// We exchange it for the session cookies, then replace into the dashboard. On failure we never
// leave a blank loader — we show an actionable error.
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const error = ref<string | null>(null)

onMounted(async () => {
  const token = route.query.token
  if (typeof token !== 'string' || token === '') {
    error.value = 'This link is missing its token.'
    return
  }
  try {
    await auth.verify(token)
    await router.replace('/dashboard')
  } catch {
    // verify rejects on a 401 (magic-link TTL is 15m) or any non-2xx.
    error.value = 'This link has expired or was already used.'
  }
})
</script>

<template>
  <section class="grid min-h-[60vh] place-items-center py-16">
    <div v-if="error" class="max-w-sm text-center">
      <h1 class="font-display text-2xl font-semibold tracking-tight text-moonlight">
        That link didn't work
      </h1>
      <p class="mt-3 text-dim">{{ error }}</p>
      <RouterLink
        to="/"
        class="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-pollen px-4 py-2.5 font-medium text-canvas shadow-glow transition hover:brightness-110 active:translate-y-px"
      >
        Request a new link
      </RouterLink>
    </div>
    <div v-else class="text-center">
      <span class="pollen-dot bloom mx-auto inline-block h-4 w-4" aria-hidden="true"></span>
      <p class="mt-4 text-dim">Signing you in…</p>
    </div>
  </section>
</template>
