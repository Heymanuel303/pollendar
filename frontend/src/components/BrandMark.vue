<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <RouterLink to="/" class="inline-flex items-center gap-2.5">
    <span class="pollen-dot bloom inline-block h-2.5 w-2.5" aria-hidden="true"></span>
    <span class="font-display text-lg font-semibold tracking-tight text-moonlight">Pollendar</span>
  </RouterLink>
</template>
