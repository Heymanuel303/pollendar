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
    requiredOverrides: Record<string, string> = {},
  ): Partial<ConfigService> => {
    const required: Record<string, string> = {
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      MAIL_FROM: 'Pollendar <no-reply@pollendar.local>',
      ...requiredOverrides,
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
    // Themed, table-based dusk HTML (gold CTA token + a layout table).
    expect(arg.html).toContain('#FFC857');
    expect(arg.html.toLowerCase()).toContain('<table');
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
    // Themed, table-based dusk HTML.
    expect(arg.html).toContain('#FFC857');
    expect(arg.html.toLowerCase()).toContain('<table');
  });

  it('sendPollCompleted HTML-escapes a user-controlled poll title', async () => {
    await service.sendPollCompleted(
      'guest@example.com',
      '<b>x</b>',
      'Mon Jun 22, 10:00',
      'http://localhost:5173/p/abc123token0000000000',
    );

    const arg = sendMail.mock.calls[0][0];
    // Markup in the title is escaped in the HTML body, never rendered live.
    expect(arg.html).toContain('&lt;b&gt;');
    expect(arg.html).not.toContain('<b>x</b>');
    // Subjects are not HTML, so the title stays verbatim there.
    expect(arg.subject).toContain('<b>x</b>');
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

  describe('with Resend SMTP credentials', () => {
    const resendConfig = (): Partial<ConfigService> =>
      buildConfig(
        {
          SMTP_SECURE: true,
          SMTP_USER: 'resend',
          SMTP_PASSWORD: 're_test_key',
        },
        {
          SMTP_HOST: 'smtp.resend.com',
          SMTP_PORT: '465',
          MAIL_FROM: 'Pollendar <pollendar@heymanuel.ch>',
        },
      );

    it('creates a secure, authenticated transporter on port 465', async () => {
      (nodemailer.createTransport as jest.Mock).mockClear();
      await compile(resendConfig());

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: { user: 'resend', pass: 're_test_key' },
      });
    });

    it('sends from the verified Resend domain From address', async () => {
      const resendService = await compile(resendConfig());
      await resendService.sendMagicLink('x@y.z', 'http://link');

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'Pollendar <pollendar@heymanuel.ch>' }),
      );
    });
  });
});
