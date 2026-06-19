import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  truncateAll,
  loginAs,
  type TestApp,
  type AuthSession,
} from './setup-e2e';

/** Thin shape returned by POST /api/polls (BigInt id serialized to a string). */
interface CreatePollBody {
  id: string;
  publicToken: string;
  shareUrl: string;
  title: string;
  status: string;
}

/** Sanitized poll returned by GET /api/public/polls/:token. */
interface PublicSlot {
  id: string;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  label: string | null;
  sortOrder: number;
}
interface PublicPollBody {
  id: string;
  title: string;
  description: string | null;
  timezone: string;
  status: string;
  dates: {
    id: string;
    eventDate: string;
    sortOrder: number;
    slots: PublicSlot[];
  }[];
}

interface SubmitBody {
  publicToken: string;
}

interface ResultsBody {
  best: {
    slotId: string;
    date: string;
    label: string | null;
    score: number;
  } | null;
  slots: {
    slotId: string;
    available: number;
    maybe: number;
    unavailable: number;
    score: number;
  }[];
}

/**
 * Poll-lifecycle e2e: create → public fetch (sanitized) → submit → results → complete. The
 * magic-link throttle is shared within this spec's app (5/60s), so this spec logs in EXACTLY ONCE in
 * `beforeAll` and reuses `session.cookieHeader` for every authed request. The DB is truncated only
 * once (before login) — never per-test — so the session/user survives; each test creates its OWN
 * poll to stay isolated. BigInt ids are stringified by the global interceptor, so every id asserted
 * here is a string.
 */
describe('Poll lifecycle (e2e)', () => {
  let ctx: TestApp;
  let session: AuthSession;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.init();
    await truncateAll(ctx.prisma);
    session = await loginAs(ctx.app, ctx.sentMail, 'creator@example.com');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const server = (): App => ctx.app.getHttpServer() as App;

  /**
   * Create a poll (one date, two slots) as the authed creator and resolve its public token + slot id
   * strings. Slot ids aren't in the thin create response, so they're read back from the public view.
   */
  const createPoll = async (
    title: string,
  ): Promise<{ id: string; publicToken: string; slotIds: string[] }> => {
    const createRes = await request(server())
      .post('/api/polls')
      .set('Cookie', session.cookieHeader)
      .send({
        title,
        dates: [
          {
            eventDate: '2026-07-01',
            sortOrder: 0,
            slots: [
              { label: 'Morning', startTime: '09:00', sortOrder: 0 },
              { label: 'Afternoon', startTime: '13:00', sortOrder: 1 },
            ],
          },
        ],
      })
      .expect(201);
    const createBody = createRes.body as CreatePollBody;

    const publicRes = await request(server())
      .get(`/api/public/polls/${createBody.publicToken}`)
      .expect(200);
    const publicBody = publicRes.body as PublicPollBody;
    const slotIds = publicBody.dates[0].slots.map((slot) => slot.id);

    return { id: createBody.id, publicToken: createBody.publicToken, slotIds };
  };

  it('creates a poll and returns string ids + a public token', async () => {
    const poll = await createPoll('Lifecycle poll');

    expect(typeof poll.id).toBe('string');
    expect(poll.publicToken).toEqual(expect.any(String));
    expect(poll.slotIds.length).toBe(2);
    for (const slotId of poll.slotIds) {
      expect(typeof slotId).toBe('string');
    }
  });

  it('public poll fetch is sanitized — no userId, participants, or emails', async () => {
    const poll = await createPoll('Sanitized poll');

    await request(server())
      .post(`/api/public/polls/${poll.publicToken}/responses`)
      .send({
        displayName: 'Voter',
        email: 'voter-secret@example.com',
        answers: [{ pollSlotId: poll.slotIds[0], availability: 'available' }],
      })
      .expect(201);

    const res = await request(server())
      .get(`/api/public/polls/${poll.publicToken}`)
      .expect(200);
    const body = res.body as PublicPollBody;

    expect(body.id).toEqual(expect.any(String));
    expect(body.title).toBe('Sanitized poll');
    expect(body.dates[0].slots).toEqual(expect.any(Array));
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('participants');
    expect(JSON.stringify(body)).not.toContain('voter-secret@example.com');
    expect(JSON.stringify(body)).not.toContain('creator@example.com');
  });

  it('submits a response, rejects a duplicate email (409) and a foreign slot (400)', async () => {
    const poll = await createPoll('Submit poll');

    const firstRes = await request(server())
      .post(`/api/public/polls/${poll.publicToken}/responses`)
      .send({
        displayName: 'Ada',
        email: 'dup@example.com',
        answers: [{ pollSlotId: poll.slotIds[0], availability: 'available' }],
      })
      .expect(201);
    expect((firstRes.body as SubmitBody).publicToken).toEqual(
      expect.any(String),
    );

    await request(server())
      .post(`/api/public/polls/${poll.publicToken}/responses`)
      .send({
        displayName: 'Ada2',
        email: 'dup@example.com',
        answers: [{ pollSlotId: poll.slotIds[1], availability: 'maybe' }],
      })
      .expect(409);

    await request(server())
      .post(`/api/public/polls/${poll.publicToken}/responses`)
      .send({
        displayName: 'Bob',
        email: 'bob@example.com',
        answers: [{ pollSlotId: '99999999', availability: 'available' }],
      })
      .expect(400);
  });

  it('computes results with the best slot matching the highest score', async () => {
    const poll = await createPoll('Results poll');

    await request(server())
      .post(`/api/public/polls/${poll.publicToken}/responses`)
      .send({
        displayName: 'Grace',
        answers: [{ pollSlotId: poll.slotIds[0], availability: 'available' }],
      })
      .expect(201);

    const res = await request(server())
      .get(`/api/public/polls/${poll.publicToken}/results`)
      .expect(200);
    const body = res.body as ResultsBody;

    expect(body.slots).toEqual(expect.any(Array));
    expect(body.slots.length).toBeGreaterThan(0);
    expect(body.best).not.toBeNull();
    expect(body.best?.slotId).toBe(poll.slotIds[0]);
    expect(body.best?.score).toBe(2);
  });

  it('completes the poll; a finalSlotId from another poll is 400', async () => {
    const poll = await createPoll('Completable poll');
    const other = await createPoll('Other poll');

    await request(server())
      .post(`/api/polls/${poll.id}/complete`)
      .set('Cookie', session.cookieHeader)
      .send({ finalSlotId: other.slotIds[0] })
      .expect(400);

    // POST /polls/:id/complete has no @HttpCode override, so it returns the Nest POST default 201.
    const res = await request(server())
      .post(`/api/polls/${poll.id}/complete`)
      .set('Cookie', session.cookieHeader)
      .send({ finalSlotId: poll.slotIds[0] })
      .expect(201);
    const body = res.body as CreatePollBody;

    expect(body.status).toBe('completed');
    expect(typeof body.id).toBe('string');
  });

  it('recalculates the public best slot after the current winner is invalidated', async () => {
    const poll = await createPoll('Best recalc on invalidate');

    await request(server())
      .post(`/api/public/polls/${poll.publicToken}/responses`)
      .send({
        displayName: 'Voter',
        answers: [{ pollSlotId: poll.slotIds[0], availability: 'available' }],
      })
      .expect(201);

    const before = await request(server())
      .get(`/api/public/polls/${poll.publicToken}/results`)
      .expect(200);
    expect((before.body as ResultsBody).best?.slotId).toBe(poll.slotIds[0]);

    // Read the creator detail (Phase 2 enriches this with date/slot ids as strings).
    interface DetailBody {
      dates: { id: string; slots: { id: string }[] }[];
    }
    const detailRes = await request(server())
      .get(`/api/polls/${poll.id}`)
      .set('Cookie', session.cookieHeader)
      .expect(200);
    const detail = detailRes.body as DetailBody;
    const dateId = detail.dates[0].id;
    expect(detail.dates[0].slots).toHaveLength(2);
    for (const slot of detail.dates[0].slots) {
      expect(typeof slot.id).toBe('string');
    }

    // Invalidate the voted winner (slotIds[0]); slotIds[1] stays active.
    await request(server())
      .patch(`/api/polls/${poll.id}`)
      .set('Cookie', session.cookieHeader)
      .send({
        dates: [
          {
            id: dateId,
            eventDate: '2026-07-01',
            sortOrder: 0,
            slots: [
              {
                id: poll.slotIds[0],
                label: 'Morning',
                startTime: '09:00',
                sortOrder: 0,
                invalidatedAt: '2026-06-19T12:00:00.000Z',
              },
              {
                id: poll.slotIds[1],
                label: 'Afternoon',
                startTime: '13:00',
                sortOrder: 1,
              },
            ],
          },
        ],
      })
      .expect(200);

    const after = await request(server())
      .get(`/api/public/polls/${poll.publicToken}/results`)
      .expect(200);
    const afterBody = after.body as ResultsBody;
    expect(afterBody.best?.slotId).toBe(poll.slotIds[1]);
    expect(afterBody.slots.every((s) => s.slotId !== poll.slotIds[0])).toBe(
      true,
    );
  });
});
