<script setup lang="ts">
import { computed } from 'vue'
import { formatDate } from '@/lib/utils/timezone'
import type { Poll } from '@/stores/pollStore'

/**
 * Presentational card for a single poll on the dashboard. `Poll` in, navigation/emit out — it owns
 * no fetching. Renders honestly from the **list** payload: it shows the response grains and event
 * date range *only* when the data is present (both are absent from `GET /api/polls` today), so the
 * card degrades gracefully and lights up automatically once hardening enriches the endpoint.
 */
const props = defineProps<{ poll: Poll }>()
const emit = defineEmits<{ share: [Poll]; more: [Poll] }>()

const isCompleted = computed<boolean>(() => props.poll.status === 'completed')

/** Response count, only when the list payload actually carries one (it does not today). */
const responseCount = computed<number | null>(
  () => props.poll.responseCount ?? props.poll._count?.participants ?? null,
)

/** Event date range (`Thu Jun 26 – Sat Jun 28`), only when nested `dates` are present (absent today). */
const dateRange = computed<string | null>(() => {
  const dates = props.poll.dates
  if (!dates || dates.length === 0) return null
  const sorted = dates.map((d) => d.eventDate).sort()
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const start = formatDate(first, props.poll.timezone)
  return first === last ? start : `${start} – ${formatDate(last, props.poll.timezone)}`
})

/** Status badge copy + tint. `cancelled` falls through to a neutral "Closed" chip (no bespoke state). */
const badge = computed<{ label: string; class: string }>(() => {
  switch (props.poll.status) {
    case 'completed':
      return { label: 'Completed', class: 'bg-mint/15 text-mint ring-mint/30' }
    case 'cancelled':
      return { label: 'Closed', class: 'bg-surface2 text-mute ring-line' }
    case 'open':
    default:
      return { label: 'Open', class: 'bg-pollen/15 text-pollen ring-pollen/30' }
  }
})

const primaryLabel = computed<string>(() => (isCompleted.value ? 'View results' : 'Manage'))
const manageTo = computed<string>(() => `/polls/${props.poll.id}`)
const hoverBorder = computed<string>(() =>
  isCompleted.value ? 'hover:border-mint/40' : 'hover:border-pollen/40',
)
const primaryClass = computed<string>(() =>
  isCompleted.value
    ? 'border border-line bg-surface text-moonlight hover:bg-surface2'
    : 'bg-pollen text-canvas shadow-glow hover:brightness-110 active:translate-y-px',
)

// NOTE: the completed card's blooming final-slot panel (mockup VARIANT 2) is intentionally omitted —
// the list payload only carries `finalSlotId` (an id), not the slot's formatted time. Resolving it
// is out of phase-4 scope; the panel returns once that data is available.
</script>

<template>
  <article
    class="group flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-card transition duration-200 hover:-translate-y-1 hover:bg-surface2 hover:shadow-glow"
    :class="hoverBorder"
  >
    <!-- Header: title + status badge -->
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="font-display text-lg font-semibold tracking-tight">{{ poll.title }}</h3>
        <p class="mt-1 text-sm text-dim">
          <template v-if="isCompleted">
            <span class="font-display">Final time locked</span>
            <span class="text-mute"> · {{ poll.timezone }}</span>
          </template>
          <template v-else>
            <span v-if="dateRange" class="num text-moonlight">{{ dateRange }}</span>
            <span class="text-mute"
              ><template v-if="dateRange"> · </template>{{ poll.timezone }}</span
            >
          </template>
        </p>
      </div>
      <span
        class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1"
        :class="badge.class"
        >{{ badge.label }}</span
      >
    </div>

    <!-- Optional description -->
    <p v-if="poll.description" class="mt-1 text-sm text-dim">{{ poll.description }}</p>

    <!-- Response grains + count — only when the list payload carries a count (absent today) -->
    <div v-if="responseCount !== null" class="mt-4 flex items-center gap-2.5 text-sm text-dim">
      <span class="flex flex-wrap items-center gap-1" aria-hidden="true">
        <span
          v-for="n in responseCount"
          :key="n"
          class="pollen-dot inline-block h-2.5 w-2.5"
        ></span>
      </span>
      <span
        ><span class="num font-medium text-moonlight">{{ responseCount }}</span> responses</span
      >
    </div>

    <!-- Actions -->
    <div class="mt-5 flex items-center gap-2">
      <RouterLink
        :to="manageTo"
        class="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium transition focus:outline-none focus:ring-2 focus:ring-pollen/40"
        :class="primaryClass"
        >{{ primaryLabel }}</RouterLink
      >
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 font-medium text-moonlight transition hover:bg-surface2 focus:outline-none focus:ring-2 focus:ring-pollen/40"
        @click="emit('share', poll)"
      >
        Share
      </button>
      <button
        type="button"
        aria-label="More options"
        class="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 font-medium text-dim transition hover:text-moonlight focus:outline-none focus:ring-2 focus:ring-pollen/40"
        @click="emit('more', poll)"
      >
        ⋯
      </button>
    </div>
  </article>
</template>
