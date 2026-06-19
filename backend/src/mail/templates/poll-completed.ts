/**
 * Renderer for the "Pollendar picked a time" notification email.
 *
 * Builds the Dusk Calendar branded, inline-styled, table-based HTML on top of the
 * Phase 1 layout helpers ({@link renderShell}, {@link heading}, {@link paragraph},
 * {@link ctaButton}) and returns the `{ subject, html, text }` triple that
 * `MailService.sendPollCompleted` hands straight to nodemailer.
 *
 * CRITICAL: `pollTitle`, `finalSlotLabel`, and `shareUrl` are user-controlled
 * (sourced from the database), so every interpolation into the HTML body MUST go
 * through {@link escapeHtml}. The `subject` and `text` strings are NOT HTML and
 * keep the raw values verbatim.
 */
import { DUSK, FONT_DISPLAY, FONT_BODY } from './tokens';
import {
  escapeHtml,
  heading,
  paragraph,
  ctaButton,
  renderShell,
} from './layout';

/**
 * Render the dusk-themed "Pollendar picked a time" notification email.
 *
 * @param pollTitle The poll's title. Raw in `subject`/`text`, escaped in HTML.
 * @param finalSlotLabel The top-pick slot's human label. Escaped in HTML.
 * @param shareUrl The public poll URL. Raw in `text`, escaped in HTML.
 * @returns The `{ subject, html, text }` multipart payload for nodemailer.
 */
export function renderPollCompleted(
  pollTitle: string,
  finalSlotLabel: string,
  shareUrl: string,
): { subject: string; html: string; text: string } {
  const subject = `Pollendar picked a time for "${pollTitle}"`;

  const safeTitle = escapeHtml(pollTitle);
  const safeSlot = escapeHtml(finalSlotLabel);
  const safeShareUrl = escapeHtml(shareUrl);

  // Highlighted top-pick chip on surface2 with a mint accent.
  const slotChip =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin:0 0 24px 0;"><tr><td bgcolor="${DUSK.surface2}" ` +
    `style="padding:14px 20px; border-radius:8px; ` +
    `border-left:4px solid ${DUSK.mint};">` +
    `<p style="margin:0 0 2px 0; font-family:${FONT_BODY}; font-size:12px; ` +
    `letter-spacing:0.08em; text-transform:uppercase; color:${DUSK.mute};">` +
    `Top pick</p>` +
    `<p style="margin:0; font-family:${FONT_DISPLAY}; font-size:18px; ` +
    `font-weight:700; color:${DUSK.mint};">${safeSlot}</p>` +
    `</td></tr></table>`;

  const bodyHtml =
    heading('Pollendar picked a time') +
    paragraph(`The poll <strong>${safeTitle}</strong> now has a chosen time.`) +
    slotChip +
    ctaButton('View the poll', shareUrl) +
    `<p style="margin:0; padding:0; font-family:${FONT_BODY}; ` +
    `font-size:13px; line-height:1.5; color:${DUSK.mute};">` +
    `Button not working? Paste this link into your browser:<br>` +
    `<a href="${safeShareUrl}" style="color:${DUSK.pollen}; ` +
    `word-break:break-all;">${safeShareUrl}</a></p>`;

  const html = renderShell({
    preheaderText: 'Pollendar picked a time for your poll',
    bodyHtml,
  });

  const text =
    `Pollendar picked a time for the poll "${pollTitle}".\n\n` +
    `Top pick: ${finalSlotLabel}\n\nView the poll: ${shareUrl}`;

  return { subject, html, text };
}
