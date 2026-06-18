import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EmailStatus, EmailType } from '@prisma/client';
import type { Participant } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const APP_URL = 'http://localhost:5173';
const POLL_ID = 1n;
const POLL_TITLE = 'Team offsite';
const PUBLIC_TOKEN = 'tok1234567890123456789x';
const SLOT_LABEL = 'Mon Jun 22, 10:00';

// Explicit generics so `.mock.calls[0][0]` is typed, matching the spec conventions elsewhere.
const findMany = jest.fn<Promise<Participant[]>, [unknown]>();
const emailLogFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const emailLogCreate = jest.fn<Promise<{ id: bigint }>, [unknown]>();
const emailLogUpdate = jest.fn<Promise<unknown>, [unknown]>();
const sendPollCompleted = jest.fn<
  Promise<void>,
  [string, string, string, string]
>();

/** Tx handle handed to `$transaction(fn)` — only the reservation reads/writes run inside it. */
const tx = {
  emailLog: { findUnique: emailLogFindUnique, create: emailLogCreate },
};

const prisma: Partial<PrismaService> = {
  participant: { findMany } as never,
  emailLog: { update: emailLogUpdate } as never,
  $transaction: jest.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(tx)
      : Promise.all(arg as unknown[]),
  ) as never,
};

const mail: Partial<MailService> = { sendPollCompleted };

const config: Partial<ConfigService> = {
  getOrThrow: jest.fn(() => APP_URL) as never,
};

const participant = (id: bigint, email: string | null): Participant => ({
  id,
  pollId: POLL_ID,
  publicToken: `p${id}`,
  displayName: `Guest ${id}`,
  email,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    findMany.mockReset();
    emailLogFindUnique.mockReset();
    emailLogCreate.mockReset();
    emailLogUpdate.mockReset();
    sendPollCompleted.mockReset();

    // Default reservation path: no existing row, create returns a fresh queued id.
    emailLogFindUnique.mockResolvedValue(null);
    let nextId = 100n;
    emailLogCreate.mockImplementation(() => Promise.resolve({ id: nextId++ }));
    emailLogUpdate.mockResolvedValue({});
    sendPollCompleted.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  const run = () =>
    service.sendPollCompletedEmails(
      POLL_ID,
      POLL_TITLE,
      PUBLIC_TOKEN,
      SLOT_LABEL,
    );

  it('emails each emailable participant once and marks the rows sent', async () => {
    findMany.mockResolvedValue([
      participant(1n, 'a@example.com'),
      participant(2n, 'b@example.com'),
    ]);

    await run();

    // findMany filters to non-null emails.
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { pollId: POLL_ID, email: { not: null } },
    });
    expect(sendPollCompleted).toHaveBeenCalledTimes(2);
    expect(emailLogCreate).toHaveBeenCalledTimes(2);
    // Both rows updated to sent.
    expect(emailLogUpdate).toHaveBeenCalledTimes(2);
    for (const call of emailLogUpdate.mock.calls) {
      expect((call[0] as { data: { status: EmailStatus } }).data.status).toBe(
        EmailStatus.sent,
      );
    }
    // Share URL embeds the public token via buildShareUrl(APP_URL, ...).
    expect(sendPollCompleted.mock.calls[0][3]).toBe(
      `${APP_URL}/p/${PUBLIC_TOKEN}`,
    );
  });

  it('sends nothing and writes no email_log rows when there are no emailable participants', async () => {
    findMany.mockResolvedValue([]);

    await run();

    expect(sendPollCompleted).not.toHaveBeenCalled();
    expect(emailLogCreate).not.toHaveBeenCalled();
    expect(emailLogUpdate).not.toHaveBeenCalled();
  });

  it('does not re-send when an email_log row is already sent', async () => {
    findMany.mockResolvedValue([participant(1n, 'a@example.com')]);
    emailLogFindUnique.mockResolvedValue({
      id: 7n,
      status: EmailStatus.sent,
    });

    await run();

    expect(emailLogCreate).not.toHaveBeenCalled();
    expect(sendPollCompleted).not.toHaveBeenCalled();
    expect(emailLogUpdate).not.toHaveBeenCalled();
  });

  it('records failed and continues to the next participant when a send rejects', async () => {
    findMany.mockResolvedValue([
      participant(1n, 'a@example.com'),
      participant(2n, 'b@example.com'),
    ]);
    sendPollCompleted
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce(undefined);

    await run();

    expect(sendPollCompleted).toHaveBeenCalledTimes(2);
    const statuses = emailLogUpdate.mock.calls.map(
      (c) => (c[0] as { data: { status: EmailStatus } }).data.status,
    );
    expect(statuses).toContain(EmailStatus.failed);
    expect(statuses).toContain(EmailStatus.sent);
    const failedCall = emailLogUpdate.mock.calls.find(
      (c) =>
        (c[0] as { data: { status: EmailStatus } }).data.status ===
        EmailStatus.failed,
    );
    expect(
      (failedCall![0] as { data: { error: string } }).data.error,
    ).toContain('smtp down');
  });

  it('reserves rows with the poll_completed type', async () => {
    findMany.mockResolvedValue([participant(1n, 'a@example.com')]);

    await run();

    expect(
      (emailLogCreate.mock.calls[0][0] as { data: { type: EmailType } }).data
        .type,
    ).toBe(EmailType.poll_completed);
  });
});
