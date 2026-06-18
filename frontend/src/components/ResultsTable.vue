<script setup lang="ts">
import { computed } from 'vue'
import { formatDate, formatSlotRange } from '@/lib/utils/timezone'
import type { PollResults, SlotMeta, SlotTally } from '@/lib/api/types'

/**
 * Per-slot tally list with a distribution bar + score. The winning slot
 * (`results.best.slotId`) blooms — and it is the ONLY element carrying `bloom-bg`.
 *
 * Ports docs/design/mockups/components/results-table.html. Rows are emitted in poll
 * DISPLAY order (`order`, the slotIds PollManage flattens out of dates -> slots); each
 * id is joined against its tally (`results.slots`, unordered) and its label metadata
 * (`slotMetaById`). Ids missing from either map are skipped.
 */
const props = defineProps<{
  results: PollResults
  slotMetaById: Record<string, SlotMeta>
  order: string[]
  timezone: string
}>()

interface ResultRow {
  slotId: string
  meta: SlotMeta
  tally: SlotTally
  total: number
  pctYes: number
  pctMaybe: number
  subLabel: string
  isWinner: boolean
}

const bestSlotId = computed<string | null>(() => props.results.best?.slotId ?? null)

/** Tallies keyed by slotId for an O(1) join against the display `order`. */
const tallyById = computed<Record<string, SlotTally>>(() => {
  const map: Record<string, SlotTally> = {}
  for (const tally of props.results.slots) {
    map[tally.slotId] = tally
  }
  return map
})

const rows = computed<ResultRow[]>(() => {
  const out: ResultRow[] = []
  for (const slotId of props.order) {
    const meta = props.slotMetaById[slotId]
    const tally = tallyById.value[slotId]
    if (!meta || !tally) continue
    const total = tally.available + tally.maybe + tally.unavailable
    const range = formatSlotRange(meta.slot, props.timezone)
    const subLabel = meta.slot.label ? `${meta.slot.label} · ${range}` : range
    out.push({
      slotId,
      meta,
      tally,
      total,
      pctYes: total ? (tally.available / total) * 100 : 0,
      pctMaybe: total ? (tally.maybe / total) * 100 : 0,
      subLabel,
      isWinner: slotId === bestSlotId.value,
    })
  }
  return out
})

/** Participant count = the busiest slot's total response count. */
const participantCount = computed<number>(() => {
  let max = 0
  for (const tally of props.results.slots) {
    const total = tally.available + tally.maybe + tally.unavailable
    if (total > max) max = total
  }
  return max
})
</script>

<template>
  <div>
    <ul class="divide-y divide-line rounded-xl border border-line bg-canvas">
      <li
        v-for="row in rows"
        :key="row.slotId"
        :data-testid="`result-row-${row.slotId}`"
        class="flex flex-col gap-3 px-4 py-4 md:grid md:grid-cols-12 md:items-center"
        :class="row.isWinner ? 'bloom-bg bloom ring-1 ring-pollen/40' : 'transition hover:bg-surface2'"
      >
        <!-- Left: date + slot sub-line -->
        <div class="md:col-span-5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-display text-base font-semibold">{{
              formatDate(row.meta.date, timezone)
            }}</span>
            <span
              v-if="row.isWinner"
              class="inline-flex items-center gap-1.5 rounded-full bg-pollen/15 px-3 py-1 text-sm font-medium text-pollen ring-1 ring-pollen/40"
              >✦ In bloom</span
            >
          </div>
          <p class="mt-0.5 text-sm text-dim">{{ row.subLabel }}</p>
        </div>

        <!-- Middle: distribution bar + numeric line -->
        <div class="md:col-span-5">
          <div class="flex h-2.5 w-full overflow-hidden rounded-full bg-no/60">
            <span data-bar="yes" class="h-full bg-yes" :style="{ width: row.pctYes + '%' }"></span>
            <span
              data-bar="maybe"
              class="h-full bg-maybe/70"
              :style="{ width: row.pctMaybe + '%' }"
            ></span>
          </div>
          <div class="mt-2 text-xs font-medium text-dim">
            {{ row.tally.available }} yes · {{ row.tally.maybe }} maybe ·
            {{ row.tally.unavailable }} no
          </div>
        </div>

        <!-- Right: score -->
        <div class="md:col-span-2 text-left md:text-right">
          <span
            class="num font-display text-3xl font-bold"
            :class="row.isWinner ? 'text-pollen' : 'text-moonlight'"
            >{{ row.tally.score }}</span
          >
        </div>
      </li>
    </ul>

    <p class="mt-4 text-xs text-mute">Score = 2 × yes + maybe. The highest score blooms.</p>
    <p class="mt-1 text-xs text-mute">
      <span class="num font-display text-dim">{{ participantCount }}</span> participants · best
      recomputed on every response
    </p>
  </div>
</template>
