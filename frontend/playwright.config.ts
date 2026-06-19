import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the Pollendar happy-path e2e (`e2e/happy-path.spec.ts`).
 *
 * Prerequisites (see README "End-to-end tests"): the docker-compose stack (PostgreSQL + Mailpit on
 * `:8025`) and the NestJS backend (`:3000/api`, migrated/seeded, CORS enabled) must be running. The
 * `webServer` block boots the Vite dev server, which proxies `/api` to the backend so the httpOnly
 * auth cookie stays same-origin.
 *
 * `baseURL` / the dev-server origin come from `VITE_APP_URL` so a LAN-IP or localhost setup both work
 * (it must match the backend's `APP_URL` / `CORS_ORIGINS`). Cookies flow through the browser context,
 * so the httpOnly session cookie just works with the default `storageState`.
 */
const appUrl = process.env.VITE_APP_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  // The flow is inherently sequential (sign in → create → vote → complete) and shares one Mailpit
  // inbox + rate limits, so a single worker keeps runs deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: appUrl,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: appUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
