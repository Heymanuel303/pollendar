/**
 * Fixed, app-wide time-block presets for the calendar bulk-apply flow. Pure TS — no Vue.
 *
 * Each preset is either a fixed time range (`isAllDay: false`) or an all-day block. The
 * {@link presetToSlot} helper turns a preset into a fresh {@link PollSlotInput} on every call so
 * callers never share object identity. `sortOrder` is deliberately left **unset** so the wire JSON
 * stays byte-identical to the one-date-at-a-time list flow (`buildPayload()` in `PollEditor.vue`).
 */
import type { PollSlotInput } from '@/types/poll'

/** A reusable time block. A range carries `startTime`/`endTime`; an all-day block carries neither. */
export type SlotPreset = { id: string; label: string } & (
  | { isAllDay: false; startTime: string; endTime: string }
  | { isAllDay: true }
)

/** The pinned, app-wide preset vocabulary (Morning / Afternoon / Evening / All day). */
export const slotPresets = [
  { id: 'morning', label: 'Morning', isAllDay: false, startTime: '09:00', endTime: '12:00' },
  { id: 'afternoon', label: 'Afternoon', isAllDay: false, startTime: '12:00', endTime: '14:00' },
  { id: 'evening', label: 'Evening', isAllDay: false, startTime: '18:00', endTime: '21:00' },
  { id: 'all-day', label: 'All day', isAllDay: true },
] as const satisfies readonly SlotPreset[]

/**
 * Map a preset to a **fresh** {@link PollSlotInput}. Returns a new object each call; `sortOrder`
 * is never assigned so the payload-identity guarantee holds.
 */
export function presetToSlot(preset: SlotPreset): PollSlotInput {
  return preset.isAllDay
    ? { isAllDay: true, label: preset.label }
    : {
        isAllDay: false,
        startTime: preset.startTime,
        endTime: preset.endTime,
        label: preset.label,
      }
}
