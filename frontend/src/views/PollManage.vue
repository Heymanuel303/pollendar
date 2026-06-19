<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
const router = useRouter()
const store = usePollStore()
const {
  currentPoll,
  results,
  participants,
  detailLoading,
  detailError,
  completing,
  completeError,
  lifecycleTransitioning,
  lifecycleError,
  removing,
  removeError,
} = storeToRefs(store)

const id = computed<string>(() => String(route.params.id ?? ''))

onMounted(async () => {
  // Single cold-load orchestrator (shape B): resets→fetches the poll, then hydrates results +
  // participants + invite. The view never chains the supplementary loaders itself.
  await store.loadDetail(id.value)
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
const isCancelled = computed<boolean>(() => currentPoll.value?.status === 'cancelled')
/** Single source for the three-state pill + lifecycle-action/Edit-link gating. */
const status = computed(() => currentPoll.value?.status)

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

/**
 * Cancel / Reopen / Delete confirm dialogs. Each `openX` clears the relevant error ref first so a
 * stale message never flashes; each `confirmX` closes on success and, on failure, leaves the dialog
 * open (the store already set the error ref). Only one lifecycle dialog is open at a time, so
 * cancel + reopen share `lifecycleTransitioning`/`lifecycleError`; delete uses `removing`/`removeError`.
 */
const cancelConfirmOpen = ref(false)
function openCancelConfirm(): void {
  lifecycleError.value = null
  cancelConfirmOpen.value = true
}
async function confirmCancel(): Promise<void> {
  if (!currentPoll.value) return
  try {
    await store.cancel(currentPoll.value.id)
    cancelConfirmOpen.value = false
  } catch {
    // The store set `lifecycleError`; keep the dialog open.
  }
}

const reopenConfirmOpen = ref(false)
function openReopenConfirm(): void {
  lifecycleError.value = null
  reopenConfirmOpen.value = true
}
async function confirmReopen(): Promise<void> {
  if (!currentPoll.value) return
  try {
    await store.reopen(currentPoll.value.id)
    reopenConfirmOpen.value = false
  } catch {
    // The store set `lifecycleError`; keep the dialog open.
  }
}

const deleteConfirmOpen = ref(false)
function openDeleteConfirm(): void {
  removeError.value = null
  deleteConfirmOpen.value = true
}
async function confirmDelete(): Promise<void> {
  if (!currentPoll.value) return
  try {
    await store.remove(currentPoll.value.id)
    deleteConfirmOpen.value = false
    await router.push('/dashboard')
  } catch {
    // The store set `removeError`; keep the dialog open.
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
          <Pill v-else-if="isCancelled" tone="neutral">Cancelled</Pill>
          <Pill v-else tone="pollen">Open · gathering responses</Pill>
          <!-- Reuses PollEditor in edit mode. Hidden for cancelled polls (not editable in place —
               reopen first); shown for open + completed. -->
          <RouterLink
            v-if="status !== 'cancelled'"
            :to="`/polls/${id}/edit`"
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

      <!-- Creator lifecycle actions: cancel (open) / reopen (cancelled|completed) + always-available
           delete. Each opens a confirm dialog below. -->
      <div class="mb-6 flex flex-wrap items-center gap-2">
        <Button v-if="status === 'open'" variant="danger" @click="openCancelConfirm"
          >Cancel poll</Button
        >
        <Button
          v-if="status === 'cancelled' || status === 'completed'"
          variant="secondary"
          @click="openReopenConfirm"
          >Reopen poll</Button
        >
        <Button variant="ghost" @click="openDeleteConfirm">Delete poll</Button>
      </div>

      <!-- Best slot bloom — replaced by a neutral notice when cancelled (BestSlotBloom's else branch
           would otherwise read "✓ Completed"). BestSlotBloom.vue stays untouched. -->
      <BestSlotBloom
        v-if="!isCancelled"
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
      <div v-else class="mb-8 rounded-2xl border border-line bg-surface p-6 text-dim shadow-card">
        This poll is cancelled. Reopen it to keep gathering responses.
      </div>

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

    <!-- Cancel-poll confirm dialog -->
    <div
      v-if="cancelConfirmOpen"
      class="fixed inset-0 z-30 grid place-items-center bg-canvas/70 p-4 sm:p-6 backdrop-blur safe-bottom"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-confirm-title"
    >
      <div class="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h2 id="cancel-confirm-title" class="font-display text-lg font-semibold tracking-tight">
          Cancel this poll?
        </h2>
        <p class="mt-2 text-sm text-dim">
          Participants will no longer be able to vote. You can reopen it later — votes are kept.
        </p>
        <p v-if="lifecycleError" class="mt-3 text-sm text-coral">{{ lifecycleError }}</p>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            :disabled="lifecycleTransitioning"
            @click="cancelConfirmOpen = false"
            >Keep poll</Button
          >
          <Button variant="danger" :loading="lifecycleTransitioning" @click="confirmCancel"
            >Cancel poll</Button
          >
        </div>
      </div>
    </div>

    <!-- Reopen-poll confirm dialog -->
    <div
      v-if="reopenConfirmOpen"
      class="fixed inset-0 z-30 grid place-items-center bg-canvas/70 p-4 sm:p-6 backdrop-blur safe-bottom"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reopen-confirm-title"
    >
      <div class="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h2 id="reopen-confirm-title" class="font-display text-lg font-semibold tracking-tight">
          Reopen this poll?
        </h2>
        <p class="mt-2 text-sm text-dim">
          Participants will be able to vote again. Any finalized time is cleared.
        </p>
        <p v-if="lifecycleError" class="mt-3 text-sm text-coral">{{ lifecycleError }}</p>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            :disabled="lifecycleTransitioning"
            @click="reopenConfirmOpen = false"
            >Cancel</Button
          >
          <Button variant="primary" :loading="lifecycleTransitioning" @click="confirmReopen"
            >Reopen poll</Button
          >
        </div>
      </div>
    </div>

    <!-- Delete-poll confirm dialog -->
    <div
      v-if="deleteConfirmOpen"
      class="fixed inset-0 z-30 grid place-items-center bg-canvas/70 p-4 sm:p-6 backdrop-blur safe-bottom"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
    >
      <div class="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h2 id="delete-confirm-title" class="font-display text-lg font-semibold tracking-tight">
          Delete this poll?
        </h2>
        <p class="mt-2 text-sm text-dim">
          This permanently removes the poll and every response. This cannot be undone.
        </p>
        <p v-if="removeError" class="mt-3 text-sm text-coral">{{ removeError }}</p>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="ghost" :disabled="removing" @click="deleteConfirmOpen = false"
            >Cancel</Button
          >
          <Button variant="danger" :loading="removing" @click="confirmDelete">Delete poll</Button>
        </div>
      </div>
    </div>
  </main>
</template>
