<script setup lang="ts">
import { formatDate } from '@/lib/utils/timezone'
import type { BestSlot, SlotMeta } from '@/lib/api/types'

/**
 * Compact inline "top pick" badge for the ShareBox footer / completed header. Ports
 * `best-slot-badge.html` Variant 2. Renders nothing until a winner exists.
 */
defineProps<{
  best: BestSlot | null
  meta: SlotMeta | null
  timezone: string
}>()
</script>

<template>
  <span
    v-if="best !== null && meta !== null"
    data-testid="best-slot-badge"
    class="inline-flex flex-wrap items-center gap-2.5"
  >
    <span
      class="inline-flex items-center gap-1.5 rounded-full bg-pollen/15 px-3 py-1 text-sm font-medium text-pollen ring-1 ring-pollen/40"
      >✦ Top pick</span
    >
    <span
      class="inline-flex items-center gap-2 rounded-full border border-pollen/30 bg-pollen/10 px-3 py-1 text-sm font-medium text-moonlight"
    >
      <span class="pollen-dot inline-block h-2 w-2"></span>
      Best:
      <span class="font-display font-semibold text-pollen"
        >{{ formatDate(meta.date, timezone)
        }}<template v-if="meta.slot.label"> · {{ meta.slot.label }}</template></span
      >
    </span>
  </span>
</template>
