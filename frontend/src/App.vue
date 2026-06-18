<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppNav from '@/components/layout/AppNav.vue'

// Public participant routes (`/p/...`, `meta.public`) render their own minimal wordmark header and
// full-width layout — they must NOT show the authenticated app nav or the constrained creator shell.
const route = useRoute()
const isPublic = computed<boolean>(() => route.meta.public === true)
</script>

<template>
  <div class="bg-dusk min-h-screen text-moonlight">
    <RouterView v-if="isPublic" />
    <template v-else>
      <AppNav />
      <main class="mx-auto max-w-6xl px-6 py-8">
        <RouterView />
      </main>
    </template>
  </div>
</template>
