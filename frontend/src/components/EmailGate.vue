<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import Button from '@/components/ui/Button.vue'

// Owns no route logic so it can be reused on Landing and later in PollEditor / PublicPoll.
withDefaults(defineProps<{ submitLabel?: string; helperText?: string }>(), {
  submitLabel: 'Send magic link',
  helperText: "No password. We'll email you a magic link.",
})

const auth = useAuthStore()

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const error = ref<string | null>(null)

async function submit(event: Event) {
  // Honour the native `required` / `type=email` constraints before touching the store.
  if (!(event.target as HTMLFormElement).checkValidity()) return
  error.value = null
  loading.value = true
  try {
    await auth.requestLink(email.value)
    // Anti-enumeration: confirm "check your inbox" regardless of whether the email has an account.
    sent.value = true
  } catch {
    // requestLink only rejects on a genuine network/5xx failure.
    error.value = "Couldn't reach the server, try again."
  } finally {
    loading.value = false
  }
}

function reset() {
  sent.value = false
  error.value = null
  email.value = ''
}
</script>

<template>
  <div>
    <form v-if="!sent" class="flex flex-col gap-3 sm:flex-row" @submit.prevent="submit">
      <label class="sr-only" for="email-gate-input">Email address</label>
      <input
        id="email-gate-input"
        v-model="email"
        type="email"
        required
        placeholder="you@work.com"
        :disabled="loading"
        class="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-moonlight placeholder:text-mute focus:border-pollen focus:outline-none focus:ring-2 focus:ring-pollen/30"
      />
      <Button type="submit" :loading="loading" class="shrink-0">{{ submitLabel }}</Button>
    </form>

    <div v-else class="bloom-bg rounded-xl border border-pollen/30 bg-surface2 p-4">
      <p class="flex items-center gap-2 font-display text-base font-semibold text-moonlight">
        <span class="pollen-dot inline-block h-2.5 w-2.5" aria-hidden="true"></span>
        Check your inbox
      </p>
      <p class="mt-1 text-sm text-dim">
        If <span class="text-moonlight">{{ email }}</span> has an account, a magic link is on its
        way.
      </p>
      <button
        type="button"
        class="mt-3 text-sm font-medium text-pollen transition hover:brightness-110"
        @click="reset"
      >
        Request again
      </button>
    </div>

    <p v-if="error" class="mt-3 flex items-center gap-1.5 text-sm text-coral">
      <span aria-hidden="true">⚠</span>{{ error }}
    </p>
    <p v-else-if="!sent" class="mt-3 text-sm text-mute">{{ helperText }}</p>
  </div>
</template>
