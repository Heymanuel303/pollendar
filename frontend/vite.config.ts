import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Match APP_URL / CORS_ORIGINS in ../.env.example so cookies are same-origin in dev.
    port: 5173,
    proxy: {
      // Dev fetches to `/api` are proxied to the NestJS backend, keeping the auth
      // cookie same-origin (no CORS) during local development.
      '/api': {
        target: 'http://192.168.1.12:3000',
        changeOrigin: true,
      },
    },
  },
})
