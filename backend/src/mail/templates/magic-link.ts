/**
 * Renderer for the passwordless magic-link sign-in email.
 *
 * Builds the Dusk Calendar branded, inline-styled, table-based HTML on top of the
 * Phase 1 layout helpers ({@link renderShell}, {@link heading}, {@link paragraph},
 * {@link ctaButton}) and returns the `{ subject, html, text }` triple that
 * `MailService.sendMagicLink` hands straight to nodemailer. The `link` is the only
 * input and is HTML-escaped wherever it enters the HTML body (the `ctaButton`
 * helper escapes the `href` itself; the visible fallback URL is escaped here).
 */
import { DUSK, FONT_BODY } from './tokens';
import {
  escapeHtml,
  heading,
  paragraph,
  ctaButton,
  renderShell,
} from './layout';

/**
 * Render the dusk-themed magic-link sign-in email.
 *
 * @param link The one-time sign-in URL. Embedded raw in `subject`/`text`, escaped
 *   wherever it enters the HTML body.
 * @returns The `{ subject, html, text }` multipart payload for nodemailer.
 */
export function renderMagicLink(link: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Your Pollendar sign-in link';

  const safeLink = escapeHtml(link);

  const bodyHtml =
    heading('Sign in to Pollendar') +
    paragraph(
      'Tap the button below to sign in. This link is for you alone — no ' +
        'password required.',
    ) +
    ctaButton('Sign in to Pollendar', link) +
    paragraph(
      `Button not working? Paste this link into your browser:<br>` +
        `<a href="${safeLink}" style="color:${DUSK.pollen}; ` +
        `word-break:break-all;">${safeLink}</a>`,
    ) +
    `<p style="margin:0; padding:0; font-family:${FONT_BODY}; ` +
    `font-size:13px; line-height:1.5; color:${DUSK.mute};">` +
    `This link expires shortly and can be used once. If you didn&#39;t ` +
    `request it, you can safely ignore this email.</p>`;

  const html = renderShell({
    preheaderText: 'Your one-time sign-in link for Pollendar',
    bodyHtml,
  });

  const text =
    `Sign in to Pollendar by opening this link:\n\n${link}\n\n` +
    `This link expires shortly and can be used once. If you didn't request ` +
    `it, ignore this email.`;

  return { subject, html, text };
}
