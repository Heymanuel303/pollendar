/**
 * Dev-only visual QA for the Dusk Calendar email templates.
 *
 * Builds 2-3 sample renders from the layout helpers and pushes them through
 * Mailpit (localhost:1025, no auth) via its own nodemailer transport, so the
 * branded HTML can be eyeballed at http://localhost:8025. It deliberately does
 * NOT import `MailService` or bootstrap Nest — it stands alone.
 *
 * Run from `backend/`:  npx tsx scripts/preview-emails.ts
 *
 * The spicy sample title (`Team sync <b>"Q3"</b> & lunch`) is here on purpose: in
 * Mailpit it MUST render as literal characters, proving the `escapeHtml` chokepoint.
 */
import * as nodemailer from 'nodemailer';
import {
  escapeHtml,
  heading,
  paragraph,
  ctaButton,
  renderShell,
} from '../src/mail/templates/layout';

const host = process.env.SMTP_HOST ?? 'localhost';
const port = Number(process.env.SMTP_PORT ?? 1025);
const from = process.env.MAIL_FROM ?? 'Pollendar <no-reply@pollendar.test>';
const to = process.env.PREVIEW_TO ?? 'preview@pollendar.test';

const transporter = nodemailer.createTransport({ host, port, secure: false });

interface Sample {
  subject: string;
  preheaderText: string;
  bodyHtml: string;
  text: string;
}

const sampleLink =
  'http://localhost:5173/auth/callback?token=preview-token-abc123';
const sampleShareUrl = 'http://localhost:5173/p/preview-share-token-000000';
const samplePollTitle = 'Team sync <b>"Q3"</b> & lunch';
const sampleSlotLabel = 'Mon Jun 22, 10:00';

function magicLinkSample(): Sample {
  const bodyHtml =
    heading('Your sign-in link') +
    paragraph('Use the button below to sign in to Pollendar.') +
    ctaButton('Sign in to Pollendar', sampleLink) +
    paragraph(
      'This link expires shortly and can be used once. If you did not request it, ignore this email.',
    );
  return {
    subject: 'Your Pollendar sign-in link',
    preheaderText: 'Your one-time sign-in link is ready.',
    bodyHtml,
    text: `Sign in to Pollendar by opening this link:\n\n${sampleLink}\n\nThis link expires shortly and can be used once. If you didn't request it, ignore this email.`,
  };
}

function pollCompletedSample(): Sample {
  const safeTitle = escapeHtml(samplePollTitle);
  const safeSlot = escapeHtml(sampleSlotLabel);
  const bodyHtml =
    heading('A poll has been finalized') +
    paragraph(`The poll "${safeTitle}" has been finalized.`) +
    paragraph(`Final slot: <strong>${safeSlot}</strong>`) +
    ctaButton('View the poll', sampleShareUrl);
  return {
    subject: `Poll "${samplePollTitle}" is finalized`,
    preheaderText: 'A poll you joined now has a final time.',
    bodyHtml,
    text: `The poll "${samplePollTitle}" has been finalized.\n\nFinal slot: ${sampleSlotLabel}\n\nView the poll: ${sampleShareUrl}`,
  };
}

async function main(): Promise<void> {
  const samples = [magicLinkSample(), pollCompletedSample()];

  for (const sample of samples) {
    await transporter.sendMail({
      from,
      to,
      subject: sample.subject,
      html: renderShell({
        preheaderText: sample.preheaderText,
        bodyHtml: sample.bodyHtml,
      }),
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
