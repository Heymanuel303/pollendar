<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DateSlotEditor from '@/components/DateSlotEditor.vue'
import CalendarDateEditor from '@/components/CalendarDateEditor.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import TimezoneSelect from '@/components/ui/TimezoneSelect.vue'
import { usePollStore } from '@/stores/pollStore'
import {
  defaultTimezone,
  formatTime,
  isoToLocalInput,
  localInputToIso,
  nextCandidateDate,
} from '@/lib/utils/timezone'
import type {
  CreatePollPayload,
  PollDateInput,
  PollSlotInput,
  UpdatePollPayload,
} from '@/types/poll'
import type { Poll as OwnedPoll, PollSlot } from '@/lib/api/types'

// Thin view: it owns the form state + validation and delegates the POST/PATCH to the store. The app
// shell (App.vue) already provides the nav + centered <main>, so this renders only the editor content.
// One component, two modes: `/polls/new` (CREATE) and `/polls/:id/edit` (EDIT) both resolve here and
// branch on the presence of `route.params.id` — see {@link isEdit}.
const route = useRoute()
const router = useRouter()
const pollStore = usePollStore()

// Absence of `route.params.id` ⇒ CREATE; presence ⇒ EDIT (equivalent to `route.name === 'poll-edit'`).
const editId = computed<string | null>(() => {
  const id = route.params.id
  return typeof id === 'string' && id !== '' ? id : null
})
const isEdit = computed<boolean>(() => editId.value !== null)
// True once the form is ready to render: create mode is immediate; edit mode flips after hydration.
const loaded = ref(false)

const title = ref('')
const description = ref('')
const timezone = ref(defaultTimezone())
// "Responses close" — a `datetime-local` wall-clock value. closesAt is PATCH-only (not accepted by
// POST /polls), so on CREATE it is surfaced but excluded from the payload; on EDIT it round-trips via
// isoToLocalInput/localInputToIso (naive-UTC anchored, matching formatCloseLabel — see timezone.ts).
const closesAtLocal = ref('')
const dates = ref<PollDateInput[]>([
  {
    eventDate: nextCandidateDate(),
    slots: [{ startTime: '18:00', endTime: '20:00', isAllDay: false }],
  },
])

/**
 * Map a loaded wire slot into a {@link PollSlotInput}, converting the wire ISO `@db.Time` instants to
 * the `"HH:mm"` form the time inputs use and stamping the vote-lock. Vote source: `PollSlot._count.responses`
 * (Phase 2 enriches `GET /polls/:id`; Phase 4 added the field to the wire type) — `> 0` ⇒ immutable in place.
 */
function hydrateSlot(slot: PollSlot): PollSlotInput {
  const hasVotes = (slot._count?.responses ?? 0) > 0
  const base = {
    id: slot.id,
    label: slot.label ?? undefined,
    invalidatedAt: slot.invalidatedAt,
    hasVotes,
  }
  return slot.isAllDay || !slot.startTime
    ? { ...base, isAllDay: true }
    : {
        ...base,
        isAllDay: false,
        startTime: formatTime(slot.startTime),
        endTime: slot.endTime ? formatTime(slot.endTime) : undefined,
      }
}

/** Hydrate every form ref from a loaded owned poll (id/invalidatedAt/hasVotes preserved for the diff). */
function hydrateFromPoll(poll: OwnedPoll): void {
  title.value = poll.title
  description.value = poll.description ?? ''
  timezone.value = poll.timezone
  closesAtLocal.value = poll.closesAt ? isoToLocalInput(poll.closesAt) : ''
  dates.value = poll.dates.map((date) => {
    const slots = date.slots.map(hydrateSlot)
    return {
      id: date.id,
      // `eventDate` arrives as a UTC-midnight ISO instant; the form + payload use the bare `"YYYY-MM-DD"`.
      eventDate: date.eventDate.slice(0, 10),
      invalidatedAt: date.invalidatedAt,
      hasVotes: slots.some((s) => s.hasVotes),
      slots,
    }
  })
}

onMounted(async () => {
  if (!isEdit.value) {
    loaded.value = true
    return
  }
  await pollStore.get(editId.value!)
  if (pollStore.currentPoll) hydrateFromPoll(pollStore.currentPoll)
  loaded.value = true
})

// Flipped true on the first submit attempt so inline errors only appear after the creator tries.
const submitted = ref(false)

const titleError = computed<string | undefined>(() =>
  submitted.value && title.value.trim() === ''
    ? 'A title is needed before you can share this poll.'
    : undefined,
)

// ── Mode-aware copy + action wiring (drives the action anchored beneath the calendar) ──
const breadcrumbLabel = computed<string>(() => (isEdit.value ? 'Edit' : 'New poll'))
const headingLabel = computed<string>(() => (isEdit.value ? 'Edit poll' : 'Create a poll'))
const subheadingLabel = computed<string>(() =>
  isEdit.value
    ? 'Add or adjust times, or deactivate ones that no longer work — votes are kept.'
    : 'Find the time everyone can make. Takes about a minute.',
)
const actionLabel = computed<string>(() => {
  if (isEdit.value) return pollStore.updating ? 'Saving…' : 'Save changes'
  return pollStore.creating ? 'Creating…' : 'Create poll'
})
const actionBusy = computed<boolean>(() => (isEdit.value ? pollStore.updating : pollStore.creating))
const actionError = computed<string | null>(() =>
  isEdit.value ? pollStore.updateError : pollStore.error,
)

/** Edit-mode guard message: at least one ACTIVE date with one ACTIVE slot must survive a save. */
const allInvalidatedError = computed<string | undefined>(() => {
  if (!submitted.value || !isEdit.value) return undefined
  const hasActive = dates.value.some(
    (d) => d.invalidatedAt == null && d.slots.some((s) => s.invalidatedAt == null),
  )
  return hasActive
    ? undefined
    : 'Keep at least one active date with a time — you can’t deactivate everything.'
})

function isValid(): boolean {
  if (title.value.trim() === '') return false
  if (isEdit.value) {
    // EDIT: validate only ACTIVE (non-invalidated) dates/slots — a deactivated entry needn't be valid.
    // At least one active date with one active slot must remain; locked (voted) active slots already
    // carry valid persisted times, so only editable (zero-vote) active slots are checked.
    const activeDatesWithActiveSlots = dates.value.filter(
      (date) => date.invalidatedAt == null && date.slots.some((slot) => slot.invalidatedAt == null),
    )
    if (activeDatesWithActiveSlots.length === 0) return false
    return activeDatesWithActiveSlots.every((date) =>
      date.slots
        .filter((slot) => slot.invalidatedAt == null)
        .every((slot) => slot.hasVotes || slot.isAllDay || (slot.startTime && slot.endTime)),
    )
  }
  // CREATE: every date has >=1 slot; each slot is all-day or has both times (unchanged).
  if (dates.value.length === 0) return false
  return dates.value.every(
    (date) =>
      date.slots.length > 0 &&
      date.slots.every((slot) => slot.isAllDay || (slot.startTime && slot.endTime)),
  )
}

/** CREATE body for `POST /polls` — NEVER carries `id`/`invalidatedAt`/`closesAt` (those are edit-only). */
function buildCreatePayload(): CreatePollPayload {
  return {
    title: title.value.trim(),
    description: description.value.trim() === '' ? undefined : description.value.trim(),
    timezone: timezone.value,
    dates: dates.value.map((date) => ({
      eventDate: date.eventDate,
      slots: date.slots.map((slot) => ({
        label: slot.label?.trim() === '' ? undefined : slot.label?.trim(),
        ...(slot.isAllDay
          ? { isAllDay: true }
          : { isAllDay: false, startTime: slot.startTime, endTime: slot.endTime }),
      })),
    })),
  }
}

/**
 * EDIT body for `PATCH /polls/:id`. Full-replace strategy — the whole `dates` set is sent every time
 * (the backend diff-update reconciles by `id`; never a delta). Existing rows carry their `id` +
 * `invalidatedAt` so invalidate/reactivate round-trips; brand-new rows omit both. `sortOrder` is
 * server-owned and never set here. `description`/`closesAt` send `null` (not `undefined`) to clear.
 */
function buildEditPayload(): UpdatePollPayload {
  return {
    title: title.value.trim(),
    description: description.value.trim() === '' ? null : description.value.trim(),
    timezone: timezone.value,
    closesAt: localInputToIso(closesAtLocal.value),
    dates: dates.value.map((date) => ({
      ...(date.id ? { id: date.id, invalidatedAt: date.invalidatedAt ?? null } : {}),
      eventDate: date.eventDate,
      slots: date.slots.map((slot) => ({
        ...(slot.id ? { id: slot.id, invalidatedAt: slot.invalidatedAt ?? null } : {}),
        label: slot.label?.trim() === '' ? undefined : slot.label?.trim(),
        ...(slot.isAllDay
          ? { isAllDay: true }
          : { isAllDay: false, startTime: slot.startTime, endTime: slot.endTime }),
      })),
    })),
  }
}

async function submit(): Promise<void> {
  submitted.value = true
  if (!isValid()) return
  try {
    if (isEdit.value) {
      await pollStore.update(editId.value!, buildEditPayload())
      // Re-hydrate so newly-assigned ids land on the inputs and the next save stays diff-correct.
      if (pollStore.currentPoll) hydrateFromPoll(pollStore.currentPoll)
      await router.push(`/polls/${editId.value}`)
    } else {
      const created = await pollStore.create(buildCreatePayload())
      await router.push(`/polls/${created.id}`)
    }
  } catch {
    // pollStore.error / pollStore.updateError holds the server message; surfaced inline by the action.
  }
}
</script>

<template>
  <div class="py-8">
    <!-- Edit mode only: hold the form until the poll has hydrated, and surface a not-found state. -->
    <div v-if="isEdit && !loaded && !pollStore.detailError" class="mt-10 text-center text-dim">
      Loading poll…
    </div>
    <div
      v-else-if="isEdit && pollStore.detailError"
      class="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card"
    >
      <h1 class="font-display text-xl font-semibold tracking-tight">
        {{ pollStore.detailError }}
      </h1>
      <p class="mt-2 text-dim">
        This poll may have been removed, or you may not have access to it.
      </p>
      <RouterLink
        to="/dashboard"
        class="mt-5 inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 font-medium text-moonlight transition hover:bg-surface2"
        >Back to your polls</RouterLink
      >
    </div>

    <template v-else>
      <div class="mb-8">
        <nav class="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-mute">
          <RouterLink to="/dashboard" class="hover:text-dim">Polls</RouterLink>
          <span>/</span>
          <span class="text-dim">{{ breadcrumbLabel }}</span>
        </nav>
        <h1 class="font-display text-3xl font-semibold tracking-tight">{{ headingLabel }}</h1>
        <p class="mt-1.5 text-dim">{{ subheadingLabel }}</p>
      </div>

      <div class="flex flex-col gap-6 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <!-- LEFT: meta form → calendar → anchored action. `contents` on mobile dissolves this
             wrapper so its children join the outer flex flow (letting the action be ordered AFTER
             the list); `lg:block` restores it as a real sticky grid column on desktop. -->
        <div class="contents lg:block lg:space-y-6 lg:self-start lg:sticky lg:top-24">
          <section class="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <form class="space-y-5" novalidate @submit.prevent="submit">
              <Field label="Poll title" :error="titleError">
                <template #default="{ id, invalid }">
                  <Input :id="id" v-model="title" :invalid="invalid" placeholder="Team dinner" />
                </template>
              </Field>

              <Field label="Short description" hint="Optional — a line of context for invitees.">
                <template #default="{ id }">
                  <Input
                    :id="id"
                    v-model="description"
                    textarea
                    :rows="2"
                    placeholder="Looking for a good evening next week."
                  />
                </template>
              </Field>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Timezone">
                  <template #default="{ id }">
                    <TimezoneSelect :id="id" v-model="timezone" />
                  </template>
                </Field>

                <Field
                  label="Responses close"
                  hint="Optional — set a deadline later from the poll."
                >
                  <template #default="{ id }">
                    <input
                      :id="id"
                      v-model="closesAtLocal"
                      type="datetime-local"
                      class="w-full rounded-xl border border-line bg-canvas px-4 py-3 font-display text-moonlight placeholder:text-mute focus:border-pollen focus:outline-none focus:ring-2 focus:ring-pollen/30"
                    />
                  </template>
                </Field>
              </div>
            </form>
          </section>

          <CalendarDateEditor
            v-model="dates"
            :timezone="timezone"
            :show-errors="submitted"
            :edit-mode="isEdit"
          />

          <!-- Primary action, anchored beneath the calendar. `order-last` drops it below the list on
               mobile (so the list is customizable before the action reads); `lg:order-none` restores
               its place in the sticky-left column on desktop. -->
          <div class="order-last space-y-2 lg:order-none">
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-pollen px-4 py-2.5 font-medium text-canvas shadow-glow transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="actionBusy"
              :aria-busy="actionBusy || undefined"
              @click="submit"
            >
              {{ actionLabel }}
            </button>
            <p v-if="allInvalidatedError" class="flex items-center gap-1.5 text-sm text-coral">
              <span aria-hidden="true">⚠</span>{{ allInvalidatedError }}
            </p>
            <p v-if="actionError" class="flex items-center gap-1.5 text-sm text-coral">
              <span aria-hidden="true">⚠</span>{{ actionError }}
            </p>
          </div>
        </div>

        <!-- RIGHT: always-editable list — the surface for adding custom slots and labels. -->
        <DateSlotEditor
          v-model="dates"
          :timezone="timezone"
          :show-errors="submitted"
          :edit-mode="isEdit"
        />
      </div>
    </template>
  </div>
</template>
