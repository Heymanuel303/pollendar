<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { usePollStore } from '@/stores/pollStore'
import BestSlotBloom from '@/components/BestSlotBloom.vue'
import AvailabilityGrid from '@/components/AvailabilityGrid.vue'
import ParticipantMatrix from '@/components/ParticipantMatrix.vue'
import BestSlotBadge from '@/components/BestSlotBadge.vue'
import ShareBox from '@/components/ShareBox.vue'
import EmptyState from '@/components/EmptyState.vue'
import Pill from '@/components/ui/Pill.vue'
import Button from '@/components/ui/Button.vue'
import { buildShareUrl } from '@/lib/invite'
import { formatCloseLabel, formatDate } from '@/lib/utils/timezone'
import type { SlotMeta } from '@/lib/api/types'

/**
 * Creator-facing manage view (`/polls/:id`): who responded, which slot is in bloom, the share box,
 * and the complete-poll flow. Thin by contract — all fetching lives in {@link usePollStore}; this
 * view only derives display shapes (a `slotId → SlotMeta` map walked once) and owns the
 * complete-confirm dialog. `finalSlotId`/`completedAt` are creator-only and never leave this view.
 */
const route = useRoute()
const store = usePollStore()
const {
  currentPoll,
  results,
  participants,
  detailLoading,
  detailError,
  completing,
  completeError,
} = storeToRefs(store)

const id = computed<string>(() => String(route.params.id ?? ''))

onMounted(async () => {
  await store.get(id.value)
  // Results + invite text are supplementary; load them in parallel once the poll resolved.
  if (currentPoll.value) {
    await Promise.all([
      store.loadResults(currentPoll.value.publicToken),
      store.loadParticipants(currentPoll.value.publicToken),
      store.loadInviteMessage(id.value),
    ])
  }
})

/** slotId → { slot, date } — derived once so the results components never re-walk dates[].slots[]. */
const slotMetaById = computed<Record<string, SlotMeta>>(() => {
  const map: Record<string, SlotMeta> = {}
  for (const date of currentPoll.value?.dates ?? []) {
    for (const slot of date.slots) map[slot.id] = { slot, date: date.eventDate }
  }
  return map
})

const best = computed(() => results.value?.best ?? null)
const bestMeta = computed<SlotMeta | null>(() =>
  best.value ? (slotMetaById.value[best.value.slotId] ?? null) : null,
)
const bestTally = computed(() =>
  best.value ? (results.value?.slots.find((s) => s.slotId === best.value?.slotId) ?? null) : null,
)
/** Headline participant count: the most-answered slot's total (available + maybe + unavailable). */
const participantCount = computed<number>(() =>
  (results.value?.slots ?? []).reduce(
    (max, s) => Math.max(max, s.available + s.maybe + s.unavailable),
    0,
  ),
)

/** Canonical share URL: the backend's value when loaded, else built from the app origin. */
const shareUrl = computed<string>(
  () =>
    store.invite?.shareUrl ??
    (currentPoll.value ? buildShareUrl(currentPoll.value.publicToken) : ''),
)

const closesAtHuman = computed<string | null>(() =>
  currentPoll.value?.closesAt
    ? formatCloseLabel(currentPoll.value.closesAt, currentPoll.value.timezone)
    : null,
)

const isCompleted = computed<boolean>(() => currentPoll.value?.status === 'completed')

/** Confirm-dialog state. `BestSlotBloom` only emits `complete`; this view owns the dialog + store call. */
const confirmOpen = ref(false)
function openConfirm(): void {
  completeError.value = null
  confirmOpen.value = true
}
async function confirmComplete(): Promise<void> {
  if (!currentPoll.value || !best.value) return
  try {
    await store.complete(currentPoll.value.id, best.value.slotId)
    confirmOpen.value = false
  } catch {
    // The store set `completeError`; keep the dialog open so the message is visible.
  }
}

/** "Confirm {date · label}" subtext shared by the dialog. */
const bestLabel = computed<string>(() => {
  if (!bestMeta.value) return ''
  const date = formatDate(bestMeta.value.date, currentPoll.value?.timezone)
  return bestMeta.value.slot.label ? `${date} · ${bestMeta.value.slot.label}` : date
})
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <RouterLink
      to="/dashboard"
      class="text-xs font-medium uppercase tracking-widest text-mute transition hover:text-dim"
      >← Polls</RouterLink
    >

    <!-- Loading -->
    <div v-if="detailLoading" class="mt-10 text-center text-dim">Loading poll…</div>

    <!-- 404 / error -->
    <EmptyState
      v-else-if="detailError || !currentPoll"
      class="mt-10"
      :title="detailError ?? 'Poll not found'"
      body="This poll may have been removed, or you may not have access to it."
    >
      <template #cta>
        <RouterLink
          to="/dashboard"
          class="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 font-medium text-moonlight transition hover:bg-surface2"
          >Back to your polls</RouterLink
        >
      </template>
    </EmptyState>

    <template v-else>
      <!-- Header -->
      <header class="mb-6 mt-3">
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            {{ currentPoll.title }}
          </h1>
          <Pill v-if="isCompleted" tone="mint">Completed</Pill>
          <Pill v-else tone="pollen">Open · gathering responses</Pill>
          <!-- Reuses PollEditor in edit mode. Reachable in any status — the editor (+ the lifecycle
               phase's reopen control) is the path back to open for cancelled/completed polls. -->
          <RouterLink
            :to="{ name: 'poll-edit', params: { id } }"
            class="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-moonlight transition hover:bg-surface2"
          >
            ✎ Edit poll
          </RouterLink>
        </div>
        <p v-if="currentPoll.description" class="mt-2 max-w-xl text-dim">
          {{ currentPoll.description }}
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-mute">
          <span
            >Timezone <span class="text-dim">{{ currentPoll.timezone }}</span></span
          >
          <span
            v-if="closesAtHuman"
            class="hidden h-1 w-1 rounded-full bg-line sm:inline-block"
          ></span>
          <span v-if="closesAtHuman"
            >Responses close <span class="num text-dim">{{ closesAtHuman }}</span></span
          >
        </div>
      </header>

      <!-- Best slot bloom -->
      <BestSlotBloom
        class="mb-8"
        :best="best"
        :meta="bestMeta"
        :timezone="currentPoll.timezone"
        :status="currentPoll.status"
        :completed-at="currentPoll.completedAt"
        :available="bestTally?.available ?? 0"
        :participant-count="participantCount"
        :completing="completing"
        @complete="openConfirm"
      />

      <!-- Two-column body -->
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div class="flex flex-col gap-8 lg:col-span-2">
          <AvailabilityGrid
            v-if="results"
            :dates="currentPoll.dates"
            :results="results"
            :timezone="currentPoll.timezone"
          />
          <ParticipantMatrix
            :dates="currentPoll.dates"
            :timezone="currentPoll.timezone"
            :participants="participants"
            :winning-slot-id="best?.slotId ?? null"
            :owner="true"
          />
        </div>

        <div class="flex flex-col gap-8">
          <!-- Participants summary -->
          <section class="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <h3 class="font-display text-lg font-semibold tracking-tight">Participants</h3>
            <div class="mt-4">
              <div class="num text-3xl font-semibold text-moonlight">{{ participantCount }}</div>
              <div class="text-xs uppercase tracking-widest text-mute">Responded</div>
            </div>
            <p class="mt-4 text-sm text-dim">
              Participants who left an email are notified when you complete the poll.
            </p>
            <BestSlotBadge
              class="mt-4"
              :best="best"
              :meta="bestMeta"
              :timezone="currentPoll.timezone"
            />
          </section>

          <!-- Share -->
          <ShareBox :poll="currentPoll" :share-url="shareUrl" :best="best" :best-meta="bestMeta" />
        </div>
      </div>
    </template>

    <!-- Complete-confirm dialog -->
    <div
      v-if="confirmOpen"
      class="fixed inset-0 z-30 grid place-items-center bg-canvas/70 p-4 sm:p-6 backdrop-blur safe-bottom"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div class="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h2 id="confirm-title" class="font-display text-lg font-semibold tracking-tight">
          Confirm the final time
        </h2>
        <p class="mt-2 text-sm text-dim">
          Confirm <span class="num font-medium text-moonlight">{{ bestLabel }}</span> as the final
          time? Participants who left an email will be notified.
        </p>
        <p v-if="completeError" class="mt-3 text-sm text-coral">{{ completeError }}</p>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="ghost" :disabled="completing" @click="confirmOpen = false"
            >Cancel</Button
          >
          <Button variant="primary" :loading="completing" @click="confirmComplete"
            >✦ Complete poll</Button
          >
        </div>
      </div>
    </div>
  </main>
</template>
