import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { validate } from '../config/env.validation';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';
import { seed } from '../../prisma/seed';

/**
 * Integration spec — requires the Phase 1 infra (Dockerized MySQL) running and the
 * Phase 3 migration applied. It runs the deterministic seed against the real database
 * inside beforeAll (twice, to prove idempotency), then asserts the fixture matches the
 * shape DESIGN §3.4 / §4 prescribes.
 */
describe('seed (integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env'], validate }),
        PrismaModule,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    // Triggers onModuleInit -> $connect() across the module graph.
    await moduleRef.init();

    // Run twice: a re-run must not duplicate rows or throw on the unique constraints.
    await seed(prisma);
    await seed(prisma);
  });

  afterAll(async () => {
    // Triggers onModuleDestroy -> $disconnect().
    await moduleRef.close();
  });

  /** Load the seeded poll with its full graph in one query. */
  const loadPoll = () =>
    prisma.poll.findFirstOrThrow({
      where: { user: { email: 'creator@example.com' } },
      include: {
        dates: { include: { slots: true } },
        participants: { include: { responses: true } },
      },
    });

  it('creates exactly one sample creator (Alice)', async () => {
    const users = await prisma.user.findMany({
      where: { email: 'creator@example.com' },
    });
    expect(users).toHaveLength(1);
    expect(users[0].displayName).toBe('Alice');
  });

  it('creates one open "Team lunch" poll with 2 dates and 4 slots', async () => {
    const poll = await loadPoll();
    expect(poll.title).toBe('Team lunch');
    expect(poll.status).toBe('open');
    expect(poll.dates).toHaveLength(2);
    expect(poll.dates.flatMap((d) => d.slots)).toHaveLength(4);
  });

  it('creates 3 participants — 2 with email, 1 anonymous (null)', async () => {
    const poll = await loadPoll();
    expect(poll.participants).toHaveLength(3);
    expect(poll.participants.filter((p) => p.email !== null)).toHaveLength(2);
    expect(poll.participants.filter((p) => p.email === null)).toHaveLength(1);
  });

  it('records the all-day slot with null start/end times and isAllDay true', async () => {
    const poll = await loadPoll();
    const allDay = poll.dates.flatMap((d) => d.slots).filter((s) => s.isAllDay);
    expect(allDay).toHaveLength(1);
    expect(allDay[0].startTime).toBeNull();
    expect(allDay[0].endTime).toBeNull();
  });

  it('creates a full 3×4 response matrix — 12 responses, one per (participant, slot)', async () => {
    const poll = await loadPoll();
    const responses = poll.participants.flatMap((p) => p.responses);
    expect(responses).toHaveLength(12);
    for (const p of poll.participants) {
      expect(p.responses).toHaveLength(4);
    }
    // Honors @@unique([participantId, pollSlotId]): every pair is distinct.
    const pairs = new Set(responses.map((r) => `${r.participantId}-${r.pollSlotId}`));
    expect(pairs.size).toBe(12);
  });
});
