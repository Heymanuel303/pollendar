/**
 * Dev-only visual QA for the Dusk Calendar email templates.
 *
 * Renders the REAL production emails — `renderMagicLink` and `renderPollCompleted`,
 * the exact same renderers `MailService` ships — and pushes them through Mailpit
 * (localhost:1025, no auth) via its own nodemailer transport, so the branded HTML
 * can be eyeballed at http://localhost:8025. It deliberately does NOT import
 * `MailService` or bootstrap Nest — it stands alone, but it previews the genuine
 * output, so what you see here is exactly what users receive.
 *
 * Run from `backend/`:  npx tsx scripts/preview-emails.ts
 *
 * The spicy sample title (`Team sync <b>"Q3"</b> & lunch`) is here on purpose: in
 * Mailpit it MUST render as literal characters, proving the `escapeHtml` chokepoint.
 */
import * as nodemailer from 'nodemailer';
import { renderMagicLink } from '../src/mail/templates/magic-link';
import { renderPollCompleted } from '../src/mail/templates/poll-completed';

const host = process.env.SMTP_HOST ?? 'localhost';
const port = Number(process.env.SMTP_PORT ?? 1025);
const from = process.env.MAIL_FROM ?? 'Pollendar <no-reply@pollendar.test>';
const to = process.env.PREVIEW_TO ?? 'preview@pollendar.test';

const transporter = nodemailer.createTransport({ host, port, secure: false });

const sampleLink =
  'http://localhost:5173/auth/callback?token=preview-token-abc123';
const sampleShareUrl = 'http://localhost:5173/p/preview-share-token-000000';
const samplePollTitle = 'Team sync <b>"Q3"</b> & lunch';
const sampleSlotLabel = 'Mon Jun 22, 10:00';

async function main(): Promise<void> {
  const samples = [
    renderMagicLink(sampleLink),
    renderPollCompleted(samplePollTitle, sampleSlotLabel, sampleShareUrl),
  ];

  for (const sample of samples) {
    await transporter.sendMail({
      from,
      to,
      subject: sample.subject,
      html: sample.html,
      text: sample.text,
    });
    console.log(`Sent preview: ${sample.subject} -> ${to}`);
  }

  console.log(`\nOpen Mailpit to review: http://localhost:8025`);
}

main().catch((err: unknown) => {
  console.error('Failed to send preview emails:', err);
  process.exit(1);
});
