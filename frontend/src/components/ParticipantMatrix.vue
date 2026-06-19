<script setup lang="ts">
import { computed } from 'vue'
import AvailabilityToggle from '@/components/AvailabilityToggle.vue'
import { formatDate, formatSlotRange } from '@/lib/utils/timezone'
import type { Availability, PollDate, ParticipantRow } from '@/lib/api/types'

/**
 * Desktop per-participant availability matrix: rows = participants (plus a leading editable "You"
 * row driven by `v-model`-style `answers`), columns = slots grouped by date, cells = yes/maybe/no
 * glyphs. Sticky left name column; the winning slot's column carries the `bloom-bg` wash.
 *
 * Purely presentational + an editable-row contract — it owns NO fetch (the parent calls
 * `store.loadParticipants`). PRIVACY: `ParticipantRow` carries `displayName` only (never `email`),
 * so no email can leak through this component. Per-participant answers key on `pollSlotId`
 * (matching `ParticipantResponseAnswer` on the wire — same key as the submission `ResponseAnswer`).
 */
const props = withDefaults(
  defineProps<{
    dates: PollDate[]
    timezone: string
    participants: ParticipantRow[]
    /** Live results' winning slot id (string), or null — drives the bloom column. */
    winningSlotId: string | null
    /** The current voter's display name for their own editable row label. */
    yourName?: string
    /** The current voter's per-slot answers, keyed by slot id; v-model-style. null = unanswered. */
    answers: Record<string, Availability | null>
    /** When false, the "You" row renders read-only cells (closed-poll Vote-disabled state). */
    editable?: boolean
  }>(),
  {
    yourName: 'You',
    editable: true,
  },
)

const emit = defineEmits<{ 'update:answers': [slotId: string, value: Availability | null] }>()

/** `participantId → (pollSlotId → availability)`, so each cell reads its answer without re-walking. */
const answersByParticipant = computed(() => {
  const byParticipant = new Map<string, Map<string, Availability>>()
  for (const row of props.participants) {
    const bySlot = new Map<string, Availability>()
    for (const answer of row.answers) {
      bySlot.set(answer.pollSlotId, answer.availability)
    }
    byParticipant.set(row.participantId, bySlot)
  }
  return byParticipant
})

/** A participant's choice for one slot, or `null` when they left it unanswered (defensive join guard). */
function answerFor(row: ParticipantRow, slotId: string): Availability | null {
  return answersByParticipant.value.get(row.participantId)?.get(slotId) ?? null
}

/** Human-readable per-glyph label for accessibility + testability. */
function availabilityLabel(value: Availability | null): string {
  if (value === 'available') return 'Yes'
  if (value === 'maybe') return 'Maybe'
  if (value === 'unavailable') return 'No'
  return 'No answer'
}
</script>

<template>
  <section class="rounded-2xl border border-line bg-surface p-6 shadow-card">
    <!-- Header: title + legend -->
    <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h2 class="font-display text-xl font-semibold tracking-tight">Who's coming</h2>
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

    <!-- Scrollable per-participant grid -->
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
                  ✦ In bloom
                </span>
              </th>
            </template>
          </tr>
        </thead>
        <tbody>
          <!-- Editable "You" row — the voter edits the same `answers` map the Vote tab uses. -->
          <tr class="border-b border-line/70">
            <td
              class="sticky left-0 z-10 bg-canvas px-4 py-3 text-left align-middle font-medium text-pollen"
            >
              {{ yourName }}
              <span
                class="ml-1.5 rounded-full bg-pollen/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-pollen ring-1 ring-pollen/30"
                >you</span
              >
            </td>
            <template v-for="date in dates" :key="date.id">
              <td
                v-for="slot in date.slots"
                :key="slot.id"
                :class="[
                  'border-l border-line/70 px-3 py-3 text-center align-middle',
                  slot.id === winningSlotId ? 'bloom-bg' : '',
                ]"
                :data-testid="slot.id === winningSlotId ? 'matrix-bloom' : undefined"
              >
                <AvailabilityToggle
                  v-if="editable"
                  :model-value="answers[slot.id] ?? null"
                  :label="`Your availability for ${formatSlotRange(slot, timezone)}`"
                  @update:model-value="emit('update:answers', slot.id, $event)"
                />
                <span
                  v-else
                  class="inline-flex items-center justify-center"
                  :data-availability="answers[slot.id] ?? 'none'"
                  :aria-label="availabilityLabel(answers[slot.id] ?? null)"
                >
                  <span
                    v-if="answers[slot.id] === 'available'"
                    class="pollen-dot inline-block h-3 w-3"
                  ></span>
                  <span
                    v-else-if="answers[slot.id] === 'maybe'"
                    class="inline-block h-3 w-3 rounded-full ring-1 ring-maybe/60"
                  ></span>
                  <span
                    v-else-if="answers[slot.id] === 'unavailable'"
                    class="inline-block h-3 w-3 rounded-full bg-no"
                  ></span>
                  <span v-else class="text-mute">—</span>
                </span>
              </td>
            </template>
          </tr>

          <!-- One read-only row per participant. -->
          <tr v-for="row in participants" :key="row.participantId" class="border-b border-line/70 last:border-b-0">
            <td
              class="sticky left-0 z-10 bg-canvas px-4 py-3 text-left align-middle text-moonlight"
            >
              {{ row.displayName }}
            </td>
            <template v-for="date in dates" :key="date.id">
              <td
                v-for="slot in date.slots"
                :key="slot.id"
                :class="[
                  'border-l border-line/70 px-3 py-3 text-center align-middle',
                  slot.id === winningSlotId ? 'bloom-bg' : '',
                ]"
                :data-testid="slot.id === winningSlotId ? 'matrix-bloom' : undefined"
              >
                <span
                  class="inline-flex items-center justify-center"
                  :data-availability="answerFor(row, slot.id) ?? 'none'"
                  :aria-label="availabilityLabel(answerFor(row, slot.id))"
                >
                  <span
                    v-if="answerFor(row, slot.id) === 'available'"
                    class="pollen-dot inline-block h-3 w-3"
                  ></span>
                  <span
                    v-else-if="answerFor(row, slot.id) === 'maybe'"
                    class="inline-block h-3 w-3 rounded-full ring-1 ring-maybe/60"
                  ></span>
                  <span
                    v-else-if="answerFor(row, slot.id) === 'unavailable'"
                    class="inline-block h-3 w-3 rounded-full bg-no"
                  ></span>
                  <span v-else class="text-mute">—</span>
                </span>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty state: no participants yet (the "You" row above still lets a fresh voter vote). -->
    <p v-if="participants.length === 0" class="mt-4 text-center text-sm text-mute">
      No responses yet.
    </p>
  </section>
</template>
