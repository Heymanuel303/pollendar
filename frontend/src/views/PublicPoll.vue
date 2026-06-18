<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { usePublicPollStore } from '@/stores/publicPollStore'
import PollSlotRow from '@/components/PollSlotRow.vue'
import { formatDate } from '@/lib/utils/timezone'
import type { Availability, ResponseAnswer, SubmitResponsesDto } from '@/lib/api/types'

/**
 * Anonymous participant entry point (`/p/:publicToken`): renders the poll's dates → slots with a
 * tri-state toggle per slot, an "About you" form, and a sticky "Leaning so far" footer. Thin —
 * fetch/submit live in `publicPollStore`; this view holds only the local form/answer state.
 */
const route = useRoute()
const router = useRouter()
const store = usePublicPollStore()
const { poll, results, loadState, submitState, errorCode, errorMessage } = storeToRefs(store)

const token = computed<string>(() => String(route.params.publicToken ?? ''))

/** The participant's per-slot choice, keyed by slot id. `null` = not answered. */
const answers = reactive<Record<string, Availability | null>>({})
const form = reactive({ displayName: '', email: '' })

onMounted(async () => {
  await store.load(token.value)
  // Results drive which slot "blooms" + the footer's leaning label. Best-effort; non-fatal if absent.
  await store.loadResults(token.value)
})

const isOpen = computed<boolean>(() => poll.value?.status === 'open')

/** The slot id currently winning per live results (marks its row as in-bloom). */
const bestSlotId = computed<string | null>(() => results.value?.best?.slotId ?? null)

/** Compact "Thu Jun 26 · Early" leaning label from live results, or `null` when none yet. */
const leaningLabel = computed<string | null>(() => {
  const best = results.value?.best
  if (!best) return null
  const dateLabel = formatDate(best.date, poll.value?.timezone)
  return best.label ? `${dateLabel} · ${best.label}` : dateLabel
})

/** Answers the participant actually set (≥1 required to submit), in the wire shape. */
const chosenAnswers = computed<ResponseAnswer[]>(() =>
  Object.entries(answers)
    .filter((entry): entry is [string, Availability] => entry[1] !== null)
    .map(([pollSlotId, availability]) => ({ pollSlotId, availability })),
)

const submitting = computed<boolean>(() => submitState.value === 'loading')

const canSubmit = computed<boolean>(
  () => form.displayName.trim() !== '' && chosenAnswers.value.length > 0 && !submitting.value,
)

/** Inline submit error: the server's exact message (coral) on a 409, generic otherwise. */
const submitError = computed<string | null>(() =>
  submitState.value === 'error' ? errorMessage.value : null,
)
const isConflict = computed<boolean>(() => errorCode.value === 409)

async function onSubmit(): Promise<void> {
  if (!canSubmit.value || !poll.value) return
  const email = form.email.trim()
  const payload: SubmitResponsesDto = {
    displayName: form.displayName.trim(),
    ...(email ? { email } : {}),
    answers: chosenAnswers.value,
  }
  try {
    await store.submit(token.value, payload)
    // Pass the just-submitted name forward so the thanks page can echo it on a warm navigation.
    await router.push({ path: `/p/${token.value}/done`, query: { name: payload.displayName } })
  } catch {
    // Store recorded errorCode/errorMessage; stay on the form (no navigation) so it isn't lost.
  }
}
</script>

<template>
  <div class="min-h-screen">
    <!-- Public header — wordmark only, no app nav. -->
    <header class="border-b border-line/70">
      <div class="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
        <span class="flex items-center gap-2.5">
          <span
            class="grid h-8 w-8 place-items-center rounded-xl bg-pollen font-display text-base font-bold text-canvas shadow-glow"
            >P</span
          >
          <span class="font-display text-lg font-semibold tracking-tight">Pollendar</span>
        </span>
        <span class="text-xs uppercase tracking-widest text-mute">pollendar.app</span>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-4 pb-with-footer pt-10 sm:px-6">
      <!-- Loading -->
      <div
        v-if="loadState === 'loading'"
        class="mt-16 flex animate-settle flex-col items-center gap-3 text-mute"
      >
        <span class="pollen-dot h-3 w-3" aria-hidden="true"></span>
        <p class="text-sm">Loading the poll…</p>
      </div>

      <!-- Load error (e.g. 404 unknown token) -->
      <div v-else-if="loadState === 'error' || !poll" class="mt-16 text-center">
        <h1 class="font-display text-2xl font-semibold tracking-tight text-moonlight">
          This poll isn't available
        </h1>
        <p class="mt-3 text-dim">
          {{ errorMessage ?? 'The link may be wrong or the poll may have been removed.' }}
        </p>
      </div>

      <template v-else>
        <!-- Poll intro -->
        <div class="mb-8">
          <div class="mb-3 flex items-center gap-2">
            <span
              v-if="isOpen"
              class="rounded-full bg-pollen/15 px-2.5 py-1 text-xs font-medium text-pollen ring-1 ring-pollen/30"
              >Open</span
            >
            <span
              v-else
              class="rounded-full bg-surface2 px-2.5 py-1 text-xs font-medium text-dim ring-1 ring-line"
              >Closed</span
            >
            <span class="text-xs uppercase tracking-widest text-mute">
              {{ isOpen ? 'gathering responses' : 'no longer accepting responses' }}
            </span>
          </div>
          <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {{ poll.title }}
          </h1>
          <p v-if="poll.description" class="mt-4 text-dim">{{ poll.description }}</p>
          <div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-mute">
            <span class="inline-flex items-center gap-1.5">
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Times shown in <span class="text-dim">{{ poll.timezone }}</span>
            </span>
          </div>
        </div>

        <!-- Closed: read-only notice, no inputs -->
        <section
          v-if="!isOpen"
          class="rounded-2xl border border-line bg-surface p-6 text-center shadow-card"
        >
          <p class="font-display text-lg font-semibold text-moonlight">This poll is closed</p>
          <p class="mt-2 text-sm text-dim">
            The organizer is no longer collecting availability for this poll.
          </p>
        </section>

        <template v-else>
          <!-- Availability input -->
          <section class="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <div class="mb-5 flex items-center justify-between">
              <h2 class="font-display text-lg font-semibold">Your availability</h2>
              <span class="text-xs uppercase tracking-widest text-mute">Tap each slot</span>
            </div>

            <div v-for="date in poll.dates" :key="date.id" class="mb-6 last:mb-0">
              <div class="mb-3 flex items-baseline gap-2">
                <h3 class="num text-sm font-semibold text-moonlight">
                  {{ formatDate(date.eventDate, poll.timezone) }}
                </h3>
              </div>
              <div class="space-y-2">
                <PollSlotRow
                  v-for="slot in date.slots"
                  :key="slot.id"
                  :poll-slot="slot"
                  :event-date="date.eventDate"
                  :timezone="poll.timezone"
                  :is-best="slot.id === bestSlotId"
                  :model-value="answers[slot.id] ?? null"
                  @update:model-value="answers[slot.id] = $event"
                />
              </div>
            </div>
          </section>

          <!-- About you -->
          <section class="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-card">
            <h2 class="mb-5 font-display text-lg font-semibold">About you</h2>
            <div class="grid gap-5 sm:grid-cols-2">
              <div>
                <label for="participant-name" class="mb-2 block text-sm font-medium text-dim">
                  Your name <span class="text-pollen">*</span>
                </label>
                <input
                  id="participant-name"
                  v-model="form.displayName"
                  maxlength="120"
                  placeholder="e.g. Aïcha"
                  class="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-moonlight placeholder:text-mute focus:border-pollen focus:outline-none focus:ring-2 focus:ring-pollen/30"
                />
              </div>
              <div>
                <label for="participant-email" class="mb-2 block text-sm font-medium text-dim">
                  Email <span class="text-mute">— optional</span>
                </label>
                <input
                  id="participant-email"
                  v-model="form.email"
                  type="email"
                  maxlength="255"
                  placeholder="you@example.com"
                  class="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-moonlight placeholder:text-mute focus:border-pollen focus:outline-none focus:ring-2 focus:ring-pollen/30"
                />
                <p class="mt-2 text-xs text-mute">Only to notify you of the final time.</p>
              </div>
            </div>
          </section>

          <p class="mt-6 text-center text-xs text-mute">Find the time everyone can make.</p>
        </template>
      </template>
    </main>

    <!-- Sticky submit bar (only while the poll is open) -->
    <div
      v-if="poll && isOpen"
      class="fixed inset-x-0 bottom-0 z-20 safe-bottom border-t border-line/70 bg-canvas/85 backdrop-blur"
    >
      <div
        class="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
      >
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-widest text-mute">Leaning so far</p>
          <p class="mt-0.5 flex items-center gap-2 text-sm">
            <template v-if="leaningLabel">
              <span class="pollen-dot inline-block h-2.5 w-2.5" aria-hidden="true"></span>
              <span class="num font-medium text-moonlight">{{ leaningLabel }}</span>
              <span class="text-pollen">✦</span>
            </template>
            <span v-else class="text-mute">No responses yet — be the first.</span>
          </p>
        </div>
        <div class="flex flex-col items-stretch gap-2 sm:items-end">
          <p
            v-if="submitError"
            class="flex items-center gap-1.5 text-sm"
            :class="isConflict ? 'text-coral' : 'text-coral'"
            role="alert"
          >
            <span aria-hidden="true">⚠</span>{{ submitError }}
          </p>
          <button
            type="button"
            :disabled="!canSubmit"
            :aria-busy="submitting || undefined"
            :class="[
              'inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition sm:w-auto',
              canSubmit
                ? 'bg-pollen text-canvas shadow-glow hover:brightness-110 active:translate-y-px'
                : 'cursor-not-allowed bg-pollen/40 text-canvas/60',
            ]"
            @click="onSubmit"
          >
            {{ submitting ? 'Submitting…' : 'Submit availability' }}
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
