import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, type TestApp } from './setup-e2e';

/**
 * Smoke test: the harness boots the whole app against the disposable schema and the global `/api`
 * prefix is wired. Replaces the stock Hello-World `/ (GET)` expectation — the root is now `/api`,
 * and `/` outside the prefix 404s.
 */
describe('App bootstrap (e2e)', () => {
  let ctx: TestApp;
  const server = (): App => ctx.app.getHttpServer() as App;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.init();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET /api → 200 with the global prefix applied', () => {
    return request(server()).get('/api').expect(200).expect('Hello World!');
  });

  it('GET / → 404 (no route outside the /api prefix)', () => {
    return request(server()).get('/').expect(404);
  });
});
