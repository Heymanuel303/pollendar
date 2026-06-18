import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * Once per e2e run (jest `globalSetup`): point Prisma at a disposable schema and reset it to a
 * clean, migrated, UNSEEDED state. Runs in the jest main process before any worker forks, so the
 * `DATABASE_URL` override here is inherited by the workers (each also re-asserts it via
 * `load-test-env.ts`).
 */
export default function globalSetup(): void {
  // Load the repo-root .env so we know the DEV url and can refuse to ever target it.
  loadEnv({ path: resolve(__dirname, '../../.env') });
  const devUrl = process.env.DATABASE_URL;

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL must be set for the e2e suite — a disposable schema, never the dev DB.',
    );
  }
  if (testUrl === devUrl) {
    throw new Error(
      'TEST_DATABASE_URL must not equal the dev DATABASE_URL — e2e must use a throwaway schema.',
    );
  }

  // Everything downstream (the Prisma CLI here + the app under test in each worker) reads
  // DATABASE_URL; pin it to the disposable schema.
  process.env.DATABASE_URL = testUrl;

  // `prisma migrate reset --force` drops the schema and replays migrations. Prisma 7 does NOT
  // auto-seed on reset, so this leaves a schema-only DB (specs create their own data via the API).
  // The command is gated for AI agents: when invoked by an agent it requires
  // PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION. We pass the parent env through so a human
  // `npm run test:e2e` is ungated, while an agent / CI run can opt in by exporting that var.
  execSync('npx prisma migrate reset --force', {
    cwd: resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
