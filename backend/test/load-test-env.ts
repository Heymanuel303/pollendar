/**
 * e2e env bootstrap, MUST run before any module that pulls in `AppModule` (it is the first import
 * in `setup-e2e.ts`). `AppModule`'s `ConfigModule.forRoot({ validate })` snapshots + validates the
 * environment when `app.module.ts` is imported, and that validated snapshot then takes precedence
 * over later `process.env` mutations. So the dev `DATABASE_URL` from the repo-root `.env` must be
 * overridden with the disposable `TEST_DATABASE_URL` here, before that snapshot is taken, or
 * `PrismaService` would connect to the dev schema.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL must be set for the e2e suite, point it at a disposable schema ' +
      '(e.g. postgresql://pollendar:pollendar@localhost:5432/pollendar_test), never the dev DATABASE_URL.',
  );
}
process.env.DATABASE_URL = testDatabaseUrl;
