<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import type { PollDateInput, PollSlotInput } from '@/types/poll'

/**
 * Pure calendar day-picker for the candidate-times editor: a tap-to-multi-select month grid that
 * stamps a single fixed default slot (`18:00–20:00`) onto each tapped day. Fully controlled over the
 * same `PollDateInput[]` array {@link DateSlotEditor} drives (byte-for-byte the same prop/emit
 * contract), so both editors bind one shared `dates` ref with no payload divergence, per-date
 * slot/label editing happens in the List editor on the right.
 *
 * Selection is derived from `modelValue` (never a parallel local ref). Month navigation is the only
 * local UI state and never emits. Every emitted `PollDateInput` is `{ eventDate: '<YYYY-MM-DD>',
 * slots }`, no `sortOrder`, no `closesAt`, so the unchanged `buildPayload()` yields a
 * `CreatePollPayload.dates[]` identical to the List flow's.
 */
const props = defineProps<{
  modelValue: PollDateInput[]
  timezone: string
  showErrors?: boolean
  /**
   * Edit mode (`/polls/:id/edit`). The Calendar editor has no per-date controls, so the richest
   * invalidate/reactivate UX lives in the List editor (`DateCard`/`SlotRow`). The Calendar editor's
   * only edit-mode job is to NOT destroy voted data: it refuses to remove a locked (voted) day on tap.
   * New/zero-vote days behave as in create mode.
   */
  editMode?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [PollDateInput[]] }>()

const { isPhone } = useBreakpoint()

/** The bare `"YYYY-MM-DD"` key of each selected date, whether stored bare or as a full ISO instant. */
const selectedSet = computed<Set<string>>(
  () => new Set(props.modelValue.map((d) => d.eventDate.slice(0, 10))),
)
const selectedCount = computed<number>(() => props.modelValue.length)

const noDates = computed<boolean>(() => props.showErrors === true && props.modelValue.length === 0)

/** Parse a bare-or-ISO date value into `[year, month0, day]` (month 0-indexed). */
function dateParts(value: string): [number, number, number] {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return [year ?? 1970, (month ?? 1) - 1, day ?? 1]
}

// ── Month-navigation state (presentation-only; never emits) ─────────────────
const seed = props.modelValue[0]?.eventDate
const [seedYear, seedMonth] = seed
  ? dateParts(seed)
  : [new Date().getFullYear(), new Date().getMonth()]
const cursorYear = ref<number>(seedYear)
const cursorMonth = ref<number>(seedMonth)

function shiftMonth(delta: number): void {
  const next = new Date(Date.UTC(cursorYear.value, cursorMonth.value + delta, 1))
  cursorYear.value = next.getUTCFullYear()
  cursorMonth.value = next.getUTCMonth()
}
const prevMonth = (): void => shiftMonth(-1)
const nextMonth = (): void => shiftMonth(1)

const monthLabel = computed<string>(() =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(cursorYear.value, cursorMonth.value, 1)),
  ),
)

const weekdayHeaders = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** The calendar matrix for the cursor month, leading blanks for alignment, then each day. */
const cells = computed<{ iso: string | null; selected: boolean }[]>(() => {
  const firstWeekday = new Date(Date.UTC(cursorYear.value, cursorMonth.value, 1)).getUTCDay()
  const dayCount = new Date(Date.UTC(cursorYear.value, cursorMonth.value + 1, 0)).getUTCDate()
  const out: { iso: string | null; selected: boolean }[] = []
  for (let i = 0; i < firstWeekday; i++) out.push({ iso: null, selected: false })
  const yyyy = String(cursorYear.value).padStart(4, '0')
  const mm = String(cursorMonth.value + 1).padStart(2, '0')
  for (let day = 1; day <= dayCount; day++) {
    const iso = `${yyyy}-${mm}-${String(day).padStart(2, '0')}`
    out.push({ iso, selected: selectedSet.value.has(iso) })
  }
  return out
})

/** The fixed default slot a tapped day receives, fresh objects so each date owns its own. */
function defaultSlots(): PollSlotInput[] {
  return [{ startTime: '18:00', endTime: '20:00', isAllDay: false }]
}

/** Tap a day → toggle its membership, re-emitting the full immutable array (controlled round-trip). */
function toggleDate(iso: string): void {
  if (selectedSet.value.has(iso)) {
    // Edit mode: a voted (locked) day must NOT be removed by a tap, its votes are preserved via
    // invalidation in the List editor, never deletion here. Tapping an unlocked/new day removes it.
    const existing = props.modelValue.find((d) => d.eventDate.slice(0, 10) === iso)
    if (props.editMode === true && existing?.id != null && existing.hasVotes === true) return
    emit(
      'update:modelValue',
      props.modelValue.filter((d) => d.eventDate.slice(0, 10) !== iso),
    )
    return
  }
  const next = [...props.modelValue, { eventDate: iso, slots: defaultSlots() }].sort((a, b) =>
    a.eventDate.localeCompare(b.eventDate),
  )
  emit('update:modelValue', next)
}

const dayBase =
  'touch-target flex items-center justify-center rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-pollen/30'
</script>

<template>
  <section class="rounded-2xl border border-line bg-surface p-6 shadow-card">
    <div class="mb-5 flex items-center justify-between gap-4">
      <div>
        <h2 class="font-display text-lg font-semibold">Candidate times</h2>
        <p class="mt-0.5 text-sm text-dim">Tap the days people can choose from.</p>
      </div>
      <span
        class="shrink-0 rounded-full bg-pollen/15 px-3 py-1 text-xs font-medium text-pollen ring-1 ring-pollen/40"
      >
        <span class="num">{{ selectedCount }}</span> selected
      </span>
    </div>

    <!-- Month navigation -->
    <div class="mb-3 flex items-center justify-between">
      <button
        type="button"
        aria-label="Previous month"
        class="touch-target flex items-center justify-center rounded-lg border border-line text-dim transition hover:text-pollen"
        @click="prevMonth"
      >
        ‹
      </button>
      <span class="font-display text-sm font-semibold text-moonlight">{{ monthLabel }}</span>
      <button
        type="button"
        aria-label="Next month"
        class="touch-target flex items-center justify-center rounded-lg border border-line text-dim transition hover:text-pollen"
        @click="nextMonth"
      >
        ›
      </button>
    </div>

    <!-- Weekday headers -->
    <div class="grid grid-cols-7 gap-1 text-center text-xs text-mute">
      <span v-for="header in weekdayHeaders" :key="header" class="py-1">{{ header }}</span>
    </div>

    <!-- Day grid -->
    <div class="grid grid-cols-7 gap-1" :class="isPhone ? 'mt-1' : 'mt-1.5'">
      <template v-for="(cell, index) in cells" :key="index">
        <span v-if="cell.iso === null" aria-hidden="true" />
        <button
          v-else
          type="button"
          :aria-pressed="cell.selected"
          :aria-label="cell.iso"
          :class="[
            dayBase,
            cell.selected
              ? 'bg-pollen text-canvas shadow-glow'
              : 'bg-canvas text-dim hover:text-moonlight',
          ]"
          @click="toggleDate(cell.iso)"
        >
          <span class="num">{{ Number(cell.iso.slice(8, 10)) }}</span>
        </button>
      </template>
    </div>

    <p v-if="noDates" class="mt-4 flex items-center gap-1.5 text-sm text-coral">
      <span aria-hidden="true">⚠</span>Add at least one candidate date.
    </p>
  </section>
</template>
