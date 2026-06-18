<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import DateSlotEditor from '@/components/DateSlotEditor.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Pill from '@/components/ui/Pill.vue'
import TimezoneSelect from '@/components/ui/TimezoneSelect.vue'
import { usePollStore } from '@/stores/pollStore'
import {
  defaultTimezone,
  formatCloseLabel,
  formatDate,
  nextCandidateDate,
} from '@/lib/utils/timezone'
import type { CreatePollPayload, PollDateInput } from '@/types/poll'

// Thin view: it owns the form state + validation and delegates the POST to the store. The app shell
// (App.vue) already provides the nav + centered <main>, so this renders only the editor's content.
const router = useRouter()
const pollStore = usePollStore()

const title = ref('')
const description = ref('')
const timezone = ref(defaultTimezone())
// "Responses close" — a `datetime-local` wall-clock value. closesAt is PATCH-only (not accepted by
// POST /polls), so it is surfaced + stored here but excluded from the create payload (see submit()).
const closesAtLocal = ref('')
const dates = ref<PollDateInput[]>([
  {
    eventDate: nextCandidateDate(),
    slots: [{ startTime: '18:00', endTime: '20:00', isAllDay: false }],
  },
])

// Flipped true on the first submit attempt so inline errors only appear after the creator tries.
const submitted = ref(false)

const titleError = computed<string | undefined>(() =>
  submitted.value && title.value.trim() === ''
    ? 'A title is needed before you can share this poll.'
    : undefined,
)

const closesPreview = computed<string | null>(() =>
  closesAtLocal.value === '' ? null : formatCloseLabel(closesAtLocal.value, timezone.value),
)

// Static illustration of how the poll will look once shared — reflects the live structure but never
// fetches tallies (results land in the manage phase). Tri-state controls below are non-interactive.
const previewRows = computed(() =>
  dates.value.flatMap((date) =>
    date.slots.map((slot) => ({
      date: formatDate(date.eventDate, timezone.value),
      label: slot.label?.trim() || (slot.isAllDay ? 'All day' : 'Untitled slot'),
      time: slot.isAllDay
        ? 'All day'
        : [slot.startTime, slot.endTime].filter(Boolean).join('–') || 'No time set',
    })),
  ),
)

function isValid(): boolean {
  if (title.value.trim() === '') return false
  if (dates.value.length === 0) return false
  return dates.value.every(
    (date) =>
      date.slots.length > 0 &&
      date.slots.every((slot) => slot.isAllDay || (slot.startTime && slot.endTime)),
  )
}

function buildPayload(): CreatePollPayload {
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

async function submit(): Promise<void> {
  submitted.value = true
  if (!isValid()) return
  try {
    const created = await pollStore.create(buildPayload())
    // TODO(poll-manage phase): closesAt is PATCH-only. Once pollStore.update() lands, if
    // `closesAtLocal` is set, follow create() with PATCH /api/polls/:id { closesAt }.
    await router.push(`/polls/${created.id}`)
  } catch {
    // pollStore.error holds the server message; it's surfaced inline beside the action.
  }
}
</script>

<template>
  <div class="py-8">
    <div class="mb-8">
      <nav class="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-mute">
        <RouterLink to="/dashboard" class="hover:text-dim">Polls</RouterLink>
        <span>/</span>
        <span class="text-dim">New poll</span>
      </nav>
      <h1 class="font-display text-3xl font-semibold tracking-tight">Create a poll</h1>
      <p class="mt-1.5 text-dim">Find the time everyone can make. Takes about a minute.</p>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <!-- LEFT: form -->
      <div class="space-y-6">
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

              <Field label="Responses close" hint="Optional — set a deadline later from the poll.">
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

        <DateSlotEditor v-model="dates" :timezone="timezone" :show-errors="submitted" />
      </div>

      <!-- RIGHT: sticky preview -->
      <aside class="lg:sticky lg:top-24 lg:self-start">
        <section class="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div class="border-b border-line/70 px-5 py-3">
            <p class="text-xs uppercase tracking-widest text-mute">Preview</p>
          </div>
          <div class="bloom-bg p-5">
            <div class="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 class="font-display text-xl font-semibold tracking-tight">
                  {{ title.trim() || 'Untitled poll' }}
                </h3>
                <p v-if="description.trim()" class="mt-1 text-sm text-dim">
                  {{ description.trim() }}
                </p>
              </div>
              <Pill tone="pollen">Open</Pill>
            </div>

            <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-mute">
              <span>{{ timezone }}</span>
              <template v-if="closesPreview">
                <span>·</span>
                <span
                  >closes <span class="num text-dim">{{ closesPreview }}</span></span
                >
              </template>
            </div>

            <p class="mb-2 text-xs uppercase tracking-widest text-mute">How people will respond</p>
            <div v-if="previewRows.length" class="space-y-2">
              <div
                v-for="(row, index) in previewRows"
                :key="index"
                class="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2.5"
              >
                <div>
                  <p class="num text-sm font-medium text-dim">{{ row.date }} · {{ row.label }}</p>
                  <p class="num text-xs text-mute">{{ row.time }}</p>
                </div>
                <div
                  class="inline-flex rounded-xl border border-line bg-surface p-1 text-xs font-medium"
                >
                  <span class="rounded-lg px-2 py-1 text-dim">Yes</span>
                  <span class="rounded-lg px-2 py-1 text-mute">Maybe</span>
                  <span class="rounded-lg px-2 py-1 text-mute">No</span>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-mute">Add a date and slot to preview the poll.</p>

            <p class="mt-4 text-xs text-mute">A shareable link is created once you publish.</p>
          </div>

          <div class="space-y-2 border-t border-line/70 p-5">
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-pollen px-4 py-2.5 font-medium text-canvas shadow-glow transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="pollStore.creating"
              :aria-busy="pollStore.creating || undefined"
              @click="submit"
            >
              {{ pollStore.creating ? 'Creating…' : 'Create poll' }}
            </button>
            <p v-if="pollStore.error" class="flex items-center gap-1.5 text-sm text-coral">
              <span aria-hidden="true">⚠</span>{{ pollStore.error }}
            </p>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
