/**
 * Jest `globalTeardown`. Intentionally a no-op: `global-setup-e2e.ts` resets (drops + re-migrates)
 * the disposable schema at the START of every run, so a stale schema can never bleed into the next
 * run. Per-spec data isolation is handled by `truncateAll`, and each spec closes its own Nest app
 * (which disconnects Prisma). Kept as a referenced file so drop/cleanup logic has a home if needed.
 */
export default async function globalTeardown(): Promise<void> {
  // no-op
}
