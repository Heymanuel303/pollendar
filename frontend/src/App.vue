<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppNav from '@/components/layout/AppNav.vue'
</script>

<template>
  <div class="bg-dusk min-h-screen text-moonlight">
    <AppNav />
    <main class="mx-auto max-w-5xl px-6 py-8">
      <RouterView />
    </main>
  </div>
</template>
