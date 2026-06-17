import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { validate } from '../config/env.validation';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

/**
 * Integration spec — requires the Phase 1 infra (Dockerized MySQL) running and the
 * Phase 3 migration applied (`npx prisma migrate dev`). It boots the real DI graph,
 * connects through PrismaService, and asserts the 3NF schema is live.
 */

/** The 10 snake_case application tables defined by DESIGN §3.4 (excludes _prisma_migrations). */
const EXPECTED_TABLES = [
  'users',
  'login_tokens',
  'auth_sessions',
  'polls',
  'poll_dates',
  'poll_slots',
  'participants',
  'responses',
  'slot_tallies',
  'email_log',
];

describe('PrismaService (integration)', () => {
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
  });

  afterAll(async () => {
    // Triggers onModuleDestroy -> $disconnect().
    await moduleRef.close();
  });

  it('resolves the global PrismaService via DI', () => {
    // Prisma's PrismaClient constructor returns a Proxy, so `instanceof PrismaService`
    // is unreliable for the subclass. Assert DI handed back our service (Nest lifecycle
    // hook present) wired to the Prisma query API instead.
    expect(prisma).toBeDefined();
    expect(typeof prisma.onModuleInit).toBe('function');
    expect(typeof prisma.$queryRaw).toBe('function');
  });

  it('connects and finds all 10 application tables', async () => {
    const rows =
      await prisma.$queryRaw<Array<Record<string, string>>>`SHOW TABLES`;
    const names = rows.map((row) => Object.values(row)[0]);

    for (const table of EXPECTED_TABLES) {
      expect(names).toContain(table);
    }
  });

  it('created the expected UNIQUE constraints', async () => {
    const uniqueKeys = async (table: string): Promise<string[]> => {
      const rows = await prisma.$queryRawUnsafe<Array<{ Key_name: string }>>(
        `SHOW INDEX FROM \`${table}\` WHERE Non_unique = 0`,
      );
      return rows.map((row) => row.Key_name);
    };

    expect(await uniqueKeys('users')).toContain('users_email_key');
    expect(await uniqueKeys('polls')).toContain('polls_public_token_key');
    expect(await uniqueKeys('participants')).toContain(
      'participants_poll_id_email_key',
    );
    expect(await uniqueKeys('responses')).toContain(
      'responses_participant_id_poll_slot_id_key',
    );
  });
});
