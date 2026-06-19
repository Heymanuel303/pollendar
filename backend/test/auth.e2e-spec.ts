import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  toCookieHeader,
  truncateAll,
  type TestApp,
} from './setup-e2e';

/** The user shape `verify` returns and `me` echoes (BigInt id serialized to a string). */
interface SerializedUser {
  id: string;
  email: string;
  displayName: string | null;
}

/**
 * Auth-lifecycle e2e: drives the real magic-link → verify → me → refresh → logout flow over HTTP
 * against the disposable test schema, asserting that only the SHA-256 hash of the login token is
 * persisted (the plaintext is recovered from the captured stub email, never the API/DB) and that
 * session cookies are httpOnly. Anti-enumeration and the unauthenticated-401 contract are covered
 * too. NOTE: the `magic-link` endpoint is hard-throttled (5/60s per IP) and the counter is shared
 * within this spec's app, so this file issues AT MOST 2 magic-link calls total.
 */
describe('Auth lifecycle (e2e)', () => {
  let ctx: TestApp;
  const server = (): App => ctx.app.getHttpServer() as App;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.init();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);
  });

  it('completes magic-link -> verify -> me -> refresh -> logout with httpOnly cookies', async () => {
    const email = 'creator@example.com';

    const linkRes = await request(server())
      .post('/api/auth/magic-link')
      .send({ email })
      .expect(200);
    expect(linkRes.body).toEqual({ ok: true });

    // Only the hash is stored, plaintext token is never persisted.
    const row = await ctx.prisma.loginToken.findFirst();
    expect(row).toBeTruthy();
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    // Recover the raw token from the captured magic-link email.
    const mail = ctx.sentMail.find(
      (m) => m.kind === 'magic-link' && m.to === email,
    );
    expect(mail?.link).toBeTruthy();
    const token = new URL(mail!.link as string).searchParams.get('token');
    expect(token).toBeTruthy();
    expect(row?.tokenHash).not.toBe(token);

    const verifyRes = await request(server())
      .post('/api/auth/verify')
      .send({ token })
      .expect(200);
    const verifyBody = verifyRes.body as { user: SerializedUser };
    expect(verifyBody.user.email).toBe(email);
    expect(typeof verifyBody.user.id).toBe('string');

    const setCookie = verifyRes.headers['set-cookie'] as unknown as string[];
    const accessCookie = setCookie.find((c) => c.startsWith('accessToken='));
    const refreshCookie = setCookie.find((c) => c.startsWith('refreshToken='));
    expect(accessCookie).toBeTruthy();
    expect(refreshCookie).toBeTruthy();
    expect(accessCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('HttpOnly');
    const cookieHeader = toCookieHeader(setCookie);

    const meRes = await request(server())
      .get('/api/auth/me')
      .set('Cookie', cookieHeader)
      .expect(200);
    const meBody = meRes.body as SerializedUser;
    expect(meBody.id).toBe(verifyBody.user.id);
    expect(meBody.email).toBe(email);

    const refreshRes = await request(server())
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader)
      .expect(200);
    expect(refreshRes.body).toEqual({ ok: true });
    const refreshedCookies = refreshRes.headers[
      'set-cookie'
    ] as unknown as string[];
    expect(refreshedCookies.some((c) => c.startsWith('accessToken='))).toBe(
      true,
    );
    expect(refreshedCookies.some((c) => c.startsWith('refreshToken='))).toBe(
      true,
    );

    const logoutRes = await request(server())
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader)
      .expect(200);
    expect(logoutRes.body).toEqual({ ok: true });
  });

  it('returns 200 for an unknown email (anti-enumeration)', async () => {
    const res = await request(server())
      .post('/api/auth/magic-link')
      .send({ email: 'nobody-unknown@example.com' })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('GET /auth/me without a cookie returns 401', async () => {
    await request(server()).get('/api/auth/me').expect(401);
  });
});
