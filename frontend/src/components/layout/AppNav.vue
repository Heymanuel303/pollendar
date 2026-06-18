<script setup lang="ts">
import BrandMark from '@/components/BrandMark.vue'
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-line bg-surface/70 backdrop-blur">
    <nav class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
      <BrandMark />
      <!-- Auth actions (sign in / out) are wired in the auth phase. -->
      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </nav>
  </header>
</template>
