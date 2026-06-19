<script setup lang="ts">
import { computed } from 'vue'
import type { PollDate, PollResults, SlotTally } from '@/lib/api/types'
import { formatDate, formatSlotRange } from '@/lib/utils/timezone'

/**
 * Read-only "constellation" matrix of *aggregate* availability. The API exposes only per-slot
 * tallies (not per-participant rows), so each slot column renders its tally as a cluster of dots —
 * this is distinct from the interactive `AvailabilityToggle`.
 *
 * The winning slot (`results.best.slotId`) blooms in exactly one place: the `bloom-bg` cell.
 */
const props = defineProps<{ dates: PollDate[]; results: PollResults; timezone: string }>()

/** A zero tally for slots with no matching `results.slots[]` entry (defensive join guard). */
const ZERO_TALLY: SlotTally = {
  slotId: '',
  available: 0,
  maybe: 0,
  unavailable: 0,
  score: 0,
}

/** `slotId → tally`, so each slot column reads its aggregate counts without re-walking the array. */
const tallyBySlotId = computed(() => {
  const map = new Map<string, SlotTally>()
  for (const tally of props.results.slots) {
    map.set(tally.slotId, tally)
  }
  return map
})

const winningSlotId = computed(() => props.results.best?.slotId ?? null)

function tallyFor(slotId: string): SlotTally {
  return tallyBySlotId.value.get(slotId) ?? { ...ZERO_TALLY, slotId }
}

/** A `0..n` range helper so the template can render exactly `count` dot spans. */
function times(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => i)
}
</script>

<template>
  <section class="rounded-2xl border border-line bg-surface p-6 shadow-card">
    <!-- Header: title + legend -->
    <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h2 class="font-display text-xl font-semibold tracking-tight">Availability</h2>
      <div class="flex items-center gap-4 text-xs text-dim">
        <span class="flex items-center gap-1.5">
          <span class="pollen-dot inline-block h-2.5 w-2.5"></span> Yes
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block h-2 w-2 rounded-full ring-1 ring-maybe/60"></span> Maybe
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block h-2 w-2 rounded-full bg-no"></span> No
        </span>
      </div>
    </div>

    <!-- Scrollable aggregate grid -->
    <div class="overflow-x-auto rounded-xl border border-line bg-canvas">
      <table class="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <!-- Date-group row -->
          <tr class="border-b border-line/70">
            <th
              class="sticky left-0 z-10 bg-canvas px-4 py-3 text-left text-xs uppercase tracking-widest text-mute"
            >
              Who
            </th>
            <th
              v-for="date in dates"
              :key="date.id"
              :colspan="date.slots.length"
              class="border-l border-line/70 px-3 py-3 text-center font-display text-sm font-semibold text-moonlight"
            >
              {{ formatDate(date.eventDate, timezone) }}
            </th>
          </tr>
          <!-- Slot sub-header row -->
          <tr class="border-b border-line/70 text-xs text-dim">
            <th class="sticky left-0 z-10 bg-canvas px-4 py-2 text-left font-normal"></th>
            <template v-for="date in dates" :key="date.id">
              <th
                v-for="slot in date.slots"
                :key="slot.id"
                class="border-l border-line/70 px-3 py-2 font-medium"
              >
                <span class="block">{{ formatSlotRange(slot, timezone) }}</span>
                <span
                  v-if="slot.id === winningSlotId"
                  class="mt-1 inline-flex items-center gap-1 rounded-full bg-pollen/15 px-2 py-0.5 text-[11px] font-medium text-pollen ring-1 ring-pollen/40"
                >
                  ✦ Top pick
                </span>
              </th>
            </template>
          </tr>
        </thead>
        <tbody>
          <!-- Single aggregate tally row -->
          <tr>
            <td
              class="sticky left-0 z-10 bg-canvas px-4 py-4 text-left text-xs uppercase tracking-widest text-mute"
            >
              Tally
            </td>
            <template v-for="date in dates" :key="date.id">
              <td
                v-for="slot in date.slots"
                :key="slot.id"
                :class="[
                  'border-l border-line/70 px-3 py-4 text-center align-top',
                  slot.id === winningSlotId ? 'bloom-bg' : '',
                ]"
                :data-testid="slot.id === winningSlotId ? 'grid-bloom' : undefined"
              >
                <div class="flex flex-wrap items-center justify-center gap-1">
                  <span
                    v-for="i in times(tallyFor(slot.id).available)"
                    :key="`yes-${i}`"
                    data-dot="yes"
                    class="pollen-dot inline-block h-3 w-3"
                  ></span>
                  <span
                    v-for="i in times(tallyFor(slot.id).maybe)"
                    :key="`maybe-${i}`"
                    data-dot="maybe"
                    class="inline-block h-3 w-3 rounded-full ring-1 ring-maybe/60"
                  ></span>
                  <span
                    v-for="i in times(tallyFor(slot.id).unavailable)"
                    :key="`no-${i}`"
                    data-dot="no"
                    class="inline-block h-3 w-3 rounded-full bg-no"
                  ></span>
                </div>
                <div class="mt-2 font-display text-lg font-bold text-moonlight">
                  {{ tallyFor(slot.id).score }}
                </div>
                <div class="mt-0.5 text-[11px] text-dim">
                  {{ tallyFor(slot.id).available }}·{{ tallyFor(slot.id).maybe }}·{{
                    tallyFor(slot.id).unavailable
                  }}
                </div>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="mt-4 text-xs text-mute">Score = 2 × yes + maybe. The highest score is the top pick.</p>
  </section>
</template>
