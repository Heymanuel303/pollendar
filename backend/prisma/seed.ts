/**
 * Deterministic, re-runnable seed for local development and tests.
 *
 * Creates one sample creator (Alice) and an open "Team lunch" poll with two dates,
 * four slots (one all-day), three participants (one anonymous, no email) and a full
 * 3×4 response matrix. Mirrors the DESIGN §4 worked-example shape so later best-slot
 * algorithm tests can reuse the fixture.
 *
 * Idempotent: every run first deletes the sample creator by unique email, which
 * cascades to the poll and all its dates/slots/participants/responses, then recreates
 * the fixture inside a single transaction. Safe to run repeatedly and as part of
 * `prisma migrate reset`.
 *
 * Prisma 7 removed the built-in engine connection, so a standalone script must build
 * its own driver adapter from DATABASE_URL (see memory: prisma7-setup).
 */
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { Availability, PrismaClient } from '@prisma/client';

// Single source of truth for env is the repo-root .env (mirrors prisma.config.ts).
loadEnv({ path: resolve(__dirname, '..', '..', '.env') });

const SAMPLE_CREATOR_EMAIL = 'creator@example.com';

/** A URL-safe 22-char token matching the Char(22) public_token columns. */
const publicToken = (): string => randomBytes(16).toString('base64url').slice(0, 22);

/** A MySQL TIME value — Prisma derives the time-of-day from a 1970-01-01 UTC DateTime. */
const time = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00Z`);

/** A MySQL DATE value — midnight UTC of the given calendar day. */
const eventDate = (iso: string): Date => new Date(iso);

export async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Idempotency: drop any prior sample data (cascades through the whole poll graph).
    await tx.user.deleteMany({ where: { email: SAMPLE_CREATOR_EMAIL } });

    const creator = await tx.user.create({
      data: { email: SAMPLE_CREATOR_EMAIL, displayName: 'Alice' },
    });

    const poll = await tx.poll.create({
      data: {
        userId: creator.id,
        publicToken: publicToken(),
        title: 'Team lunch',
        timezone: 'Europe/Brussels',
        status: 'open',
        finalSlotId: null,
        dates: {
          create: [
            {
              eventDate: eventDate('2026-06-26'),
              sortOrder: 0,
              slots: {
                create: [
                  { label: 'Lunch', startTime: time('12:00'), endTime: time('13:00'), sortOrder: 0 },
                  { label: 'Dinner', startTime: time('18:00'), endTime: time('19:00'), sortOrder: 1 },
                ],
              },
            },
            {
              eventDate: eventDate('2026-06-27'),
              sortOrder: 1,
              slots: {
                create: [
                  { isAllDay: true, sortOrder: 0 },
                  { label: 'Morning', startTime: time('10:00'), endTime: time('11:00'), sortOrder: 1 },
                ],
              },
            },
          ],
        },
      },
      include: {
        dates: {
          orderBy: { sortOrder: 'asc' },
          include: { slots: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    // Flatten to the slot order [Lunch, Dinner, all-day, Morning] the matrix indexes into.
    const slots = poll.dates.flatMap((d) => d.slots);

    const participants: Array<{
      displayName: string;
      email: string | null;
      availability: Availability[];
    }> = [
      {
        displayName: 'Bob',
        email: 'bob@example.com',
        availability: [Availability.available, Availability.maybe, Availability.unavailable, Availability.available],
      },
      {
        displayName: 'Charlie',
        email: null, // anonymous — no email on file
        availability: [Availability.available, Availability.unavailable, Availability.maybe, Availability.available],
      },
      {
        displayName: 'Diana',
        email: 'diana@example.com',
        availability: [Availability.maybe, Availability.available, Availability.available, Availability.unavailable],
      },
    ];

    for (const p of participants) {
      await tx.participant.create({
        data: {
          pollId: poll.id,
          publicToken: publicToken(),
          displayName: p.displayName,
          email: p.email,
          responses: {
            create: slots.map((slot, i) => ({
              pollSlotId: slot.id,
              availability: p.availability[i],
            })),
          },
        },
      });
    }
  });
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is not set — cannot seed (expected in repo-root .env).');
  }

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  try {
    await seed(prisma);
    console.log(
      '✓ Seed complete: "Team lunch" poll — 2 dates, 4 slots, 3 participants, 12 responses.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (`prisma db seed` / `tsx prisma/seed.ts`),
// never when imported by the spec.
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
