<script setup lang="ts">
import { computed, ref } from 'vue'
import AvailabilityToggle from '@/components/AvailabilityToggle.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { formatDate, formatSlotRange } from '@/lib/utils/timezone'
import type { Availability, PollDate, ParticipantRow } from '@/lib/api/types'

/**
 * Per-participant availability matrix, adaptive across breakpoints, with a dual contract:
 *
 * - Voter mode (PublicPoll, default): renders the editable "You" row driven by `answers` +
 *   `@update:answers`, so the voter edits the same map the Vote tab uses.
 * - Owner mode (`owner` prop, the manager on PollManage): fully read-only — NO "You" row, no
 *   `answers` map, no emit. Only the per-participant rows render. The manager is not a voter.
 *
 * Desktop (`v-else`, `data-testid="matrix-table"`): rows = participants (plus, in voter mode, a
 * leading editable "You" row driven by `v-model`-style `answers`), columns = slots grouped by date,
 * cells = yes/maybe/no glyphs. Sticky left name column; the winning slot's column carries the
 * `bloom-bg` wash and horizontal scroll handles overflow.
 *
 * Mobile (`v-if="bp.isPhone"`, `data-testid="matrix-cards"`): one full-width card per slot (NO
 * horizontal scroll) grouped by date, the voter's tri-state `AvailabilityToggle` inline at the top
 * (voter mode only), then read-only name chips grouped under Yes / Maybe / No with a `+N more`
 * overflow control.
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
    /** The current voter's display name for their own editable row label (voter mode). */
    yourName?: string
    /** The current voter's per-slot answers, keyed by slot id; v-model-style. null = unanswered. Omitted in owner mode. */
    answers?: Record<string, Availability | null>
    /** When false, the "You" row renders read-only cells (closed-poll Vote-disabled state). */
    editable?: boolean
    /** Read-only manager view: suppresses the "You" row + mobile "Your vote" toggle entirely. */
    owner?: boolean
  }>(),
  {
    yourName: 'You',
    editable: true,
    owner: false,
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

/* ── Mobile card-stack ──────────────────────────────────────────────────────
   Runtime DOM switch: phones get the card-stack, everything else the table.
   `useBreakpoint` owns the `typeof window` guard; destructured so the template
   auto-unwraps the ref (a nested `bp.isPhone` would never unwrap → always truthy). */
const { isPhone } = useBreakpoint()

/** Read-only name lists for one slot, partitioned by answer — Yes / Maybe / No (mobile chips). */
const GROUPS = [
  {
    kind: 'available' as Availability,
    label: 'Yes',
    chip: 'bg-yes/15 text-yes ring-1 ring-yes/40',
  },
  {
    kind: 'maybe' as Availability,
    label: 'Maybe',
    chip: 'bg-maybe/15 text-maybe ring-1 ring-maybe/40',
  },
  {
    kind: 'unavailable' as Availability,
    label: 'No',
    chip: 'bg-no/15 text-moonlight ring-1 ring-no/50',
  },
]

/** Number of name chips shown before collapsing the remainder into a `+N more` control. */
const CHIP_LIMIT = 6

/** Display names of every participant who picked `kind` for `slotId` (read-only; `displayName` only). */
function namesForSlot(slotId: string, kind: Availability): string[] {
  return props.participants
    .filter((row) => answerFor(row, slotId) === kind)
    .map((row) => row.displayName)
}

/** Expanded `slotId|kind` groups whose full chip list is shown (tap `+N more` to add). */
const expandedGroups = ref<Set<string>>(new Set())

function groupKey(slotId: string, kind: Availability): string {
  return `${slotId}|${kind}`
}

function isGroupExpanded(slotId: string, kind: Availability): boolean {
  return expandedGroups.value.has(groupKey(slotId, kind))
}

function toggleGroup(slotId: string, kind: Availability): void {
  const key = groupKey(slotId, kind)
  const next = new Set(expandedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedGroups.value = next
}

/** The chips to render for a group, honouring the `CHIP_LIMIT` collapse unless expanded. */
function visibleNames(slotId: string, kind: Availability): string[] {
  const names = namesForSlot(slotId, kind)
  if (isGroupExpanded(slotId, kind)) return names
  return names.slice(0, CHIP_LIMIT)
}

/** How many names are hidden behind the `+N more` control (0 when nothing is collapsed). */
function overflowCount(slotId: string, kind: Availability): number {
  if (isGroupExpanded(slotId, kind)) return 0
  return Math.max(0, namesForSlot(slotId, kind).length - CHIP_LIMIT)
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

    <!-- Mobile: one full-width card per slot (no horizontal scroll). -->
    <div v-if="isPhone" class="space-y-6" data-testid="matrix-cards">
      <div v-for="date in dates" :key="date.id" class="space-y-3">
        <h3 class="num text-sm font-semibold text-moonlight">
          {{ formatDate(date.eventDate, timezone) }}
        </h3>
        <article
          v-for="slot in date.slots"
          :key="slot.id"
          :class="[
            'w-full rounded-2xl border border-line bg-surface p-4 shadow-card',
            slot.id === winningSlotId ? 'bloom-bg border-pollen/40 shadow-glow' : '',
          ]"
          :data-testid="slot.id === winningSlotId ? 'matrix-card-bloom' : undefined"
        >
          <!-- Card header: slot range + in-bloom pill for the winner. -->
          <header class="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h4 class="num text-base font-semibold text-moonlight">
              {{ formatSlotRange(slot, timezone) }}
            </h4>
            <span
              v-if="slot.id === winningSlotId"
              class="inline-flex items-center gap-1 rounded-full bg-pollen/15 px-2 py-0.5 text-[11px] font-medium text-pollen ring-1 ring-pollen/40"
            >
              ✦ In bloom
            </span>
          </header>

          <!-- The voter's own tri-state control, inline at the top of the card (voter mode only). -->
          <div v-if="!owner" class="mb-4">
            <p class="mb-2 text-xs uppercase tracking-widest text-mute">Your vote</p>
            <div class="touch-target flex items-center">
              <AvailabilityToggle
                :model-value="answers?.[slot.id] ?? null"
                :disabled="!editable"
                :label="`Your availability for ${formatSlotRange(slot, timezone)}`"
                @update:model-value="emit('update:answers', slot.id, $event)"
              />
            </div>
          </div>

          <!-- Read-only name chips grouped under Yes / Maybe / No. -->
          <div class="space-y-3">
            <div v-for="group in GROUPS" :key="group.kind">
              <h5
                class="mb-1.5 text-xs uppercase tracking-widest text-dim"
                :aria-label="`${group.label} for ${formatSlotRange(slot, timezone)}`"
              >
                {{ group.label }}
              </h5>
              <div v-if="namesForSlot(slot.id, group.kind).length > 0" class="flex flex-wrap gap-2">
                <span
                  v-for="name in visibleNames(slot.id, group.kind)"
                  :key="name"
                  :class="['rounded-full px-3 py-1 text-sm', group.chip]"
                >
                  {{ name }}
                </span>
                <button
                  v-if="overflowCount(slot.id, group.kind) > 0"
                  type="button"
                  class="touch-target inline-flex items-center rounded-full border border-line px-3 py-1 text-sm text-dim transition hover:text-moonlight focus:outline-none focus:ring-2 focus:ring-pollen/40"
                  :aria-expanded="isGroupExpanded(slot.id, group.kind)"
                  :aria-label="`Show ${overflowCount(slot.id, group.kind)} more ${group.label} names`"
                  @click="toggleGroup(slot.id, group.kind)"
                >
                  +{{ overflowCount(slot.id, group.kind) }} more
                </button>
                <button
                  v-else-if="
                    isGroupExpanded(slot.id, group.kind) &&
                    namesForSlot(slot.id, group.kind).length > CHIP_LIMIT
                  "
                  type="button"
                  class="touch-target inline-flex items-center rounded-full border border-line px-3 py-1 text-sm text-dim transition hover:text-moonlight focus:outline-none focus:ring-2 focus:ring-pollen/40"
                  :aria-expanded="true"
                  :aria-label="`Show fewer ${group.label} names`"
                  @click="toggleGroup(slot.id, group.kind)"
                >
                  Show less
                </button>
              </div>
              <p v-else class="text-sm text-mute">No one yet</p>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- Desktop: scrollable per-participant grid. -->
    <div
      v-else
      class="overflow-x-auto rounded-xl border border-line bg-canvas"
      data-testid="matrix-table"
    >
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
          <!-- Editable "You" row — the voter edits the same `answers` map the Vote tab uses.
               Suppressed entirely in owner mode (the manager is not a voter). -->
          <tr v-if="!owner" class="border-b border-line/70">
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
                  :model-value="answers?.[slot.id] ?? null"
                  :label="`Your availability for ${formatSlotRange(slot, timezone)}`"
                  @update:model-value="emit('update:answers', slot.id, $event)"
                />
                <span
                  v-else
                  class="inline-flex items-center justify-center"
                  :data-availability="answers?.[slot.id] ?? 'none'"
                  :aria-label="availabilityLabel(answers?.[slot.id] ?? null)"
                >
                  <span
                    v-if="answers?.[slot.id] === 'available'"
                    class="pollen-dot inline-block h-3 w-3"
                  ></span>
                  <span
                    v-else-if="answers?.[slot.id] === 'maybe'"
                    class="inline-block h-3 w-3 rounded-full ring-1 ring-maybe/60"
                  ></span>
                  <span
                    v-else-if="answers?.[slot.id] === 'unavailable'"
                    class="inline-block h-3 w-3 rounded-full bg-no"
                  ></span>
                  <span v-else class="text-mute">—</span>
                </span>
              </td>
            </template>
          </tr>

          <!-- One read-only row per participant. -->
          <tr
            v-for="row in participants"
            :key="row.participantId"
            class="border-b border-line/70 last:border-b-0"
          >
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
