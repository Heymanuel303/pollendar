jest.mock('nodemailer');
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MailService } from './mail.service';

interface SentMail {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}

describe('MailService', () => {
  let service: MailService;
  const sendMail = jest.fn<Promise<unknown>, [SentMail]>();

  const buildConfig = (
    overrides: Record<string, unknown> = {},
  ): Partial<ConfigService> => {
    const required: Record<string, string> = {
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      MAIL_FROM: 'Pollendar <no-reply@pollendar.local>',
    };
    const optional: Record<string, unknown> = {
      SMTP_SECURE: false,
      SMTP_USER: undefined,
      SMTP_PASSWORD: undefined,
      ...overrides,
    };
    return {
      getOrThrow: jest.fn((key: string) => required[key]) as never,
      get: jest.fn((key: string) => optional[key]) as never,
    };
  };

  const compile = async (
    config: Partial<ConfigService>,
  ): Promise<MailService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [MailService, { provide: ConfigService, useValue: config }],
    }).compile();
    return moduleRef.get(MailService);
  };

  beforeEach(async () => {
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    sendMail.mockReset();
    (nodemailer.createTransport as jest.Mock).mockClear();
    service = await compile(buildConfig());
  });

  it('creates a transporter without auth when no SMTP credentials', () => {
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      auth: undefined,
    });
  });

  it('sendMagicLink sends an email to the address with the link in the body', async () => {
    const link = 'http://localhost:5173/auth/callback?token=abc';
    await service.sendMagicLink('creator@example.com', link);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe('creator@example.com');
    expect(arg.from).toBe('Pollendar <no-reply@pollendar.local>');
    expect(arg.html).toContain(link);
    expect(arg.text).toContain(link);
  });

  it('sendPollCompleted sends to the address with the slot label and share URL', async () => {
    const shareUrl = 'http://localhost:5173/p/abc123token0000000000';
    await service.sendPollCompleted(
      'guest@example.com',
      'Team offsite',
      'Mon Jun 22, 10:00',
      shareUrl,
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe('guest@example.com');
    expect(arg.from).toBe('Pollendar <no-reply@pollendar.local>');
    expect(arg.subject).toContain('Team offsite');
    expect(arg.html).toContain(shareUrl);
    expect(arg.html).toContain('Mon Jun 22, 10:00');
    expect(arg.text).toContain(shareUrl);
    expect(arg.text).toContain('Mon Jun 22, 10:00');
  });

  it('sendPollCompleted re-throws when the transport fails', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(
      service.sendPollCompleted('x@y.z', 'P', 'slot', 'http://link'),
    ).rejects.toThrow('smtp down');
  });

  it('sendMagicLink re-throws when the transport fails', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(service.sendMagicLink('x@y.z', 'http://link')).rejects.toThrow(
      'smtp down',
    );
  });

  describe('with SMTP credentials', () => {
    it('passes auth to the transporter', async () => {
      (nodemailer.createTransport as jest.Mock).mockClear();
      await compile(
        buildConfig({ SMTP_USER: 'mailuser', SMTP_PASSWORD: 'secret' }),
      );

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'localhost',
        port: 1025,
        secure: false,
        auth: { user: 'mailuser', pass: 'secret' },
      });
    });
  });
});
