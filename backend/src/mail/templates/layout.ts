/**
 * Bulletproof dark-email layout helpers for the Dusk Calendar theme.
 *
 * Pure string-in/string-out functions that build branded, inline-styled,
 * table-based HTML from the {@link DUSK} tokens. They are deliberately free of
 * NestJS and `MailService` imports so they are trivially unit-testable and can be
 * reused by the preview script and the per-email renderers.
 *
 * Constraints baked in here:
 * - All styles are INLINE — there is no `<style>` block and no external CSS.
 * - Bulletproof dark patterns: `color-scheme`/`supported-color-schemes` metas, a
 *   hidden preheader span, and an MSO/Outlook conditional fallback for the gold CTA.
 * - {@link escapeHtml} is the single chokepoint every user-controlled value
 *   (poll title, slot label, URLs, link) MUST pass through to prevent injection.
 */
import { DUSK, FONT_DISPLAY, FONT_BODY } from './tokens';

/**
 * Escape the five HTML-significant characters so user-controlled text renders as
 * literal characters and can never inject markup or break out of an attribute.
 *
 * Order matters: `&` is replaced first so the entities introduced by the later
 * replacements are not double-escaped.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A hidden preheader span: the snippet inbox clients show next to the subject.
 * Kept off-screen with the standard bulletproof inline rules so the preview is
 * controlled rather than leaked from the body copy. The text is escaped.
 */
export function preheader(text: string): string {
  return (
    `<span style="display:none !important; visibility:hidden; opacity:0; ` +
    `color:transparent; height:0; width:0; max-height:0; max-width:0; ` +
    `overflow:hidden; mso-hide:all;">${escapeHtml(text)}</span>`
  );
}

/**
 * A top-level heading. Rendered as a fully inline-styled `<h1>` using the display
 * font on moonlight text. The text is escaped.
 */
export function heading(text: string): string {
  return (
    `<h1 style="margin:0 0 16px 0; padding:0; font-family:${FONT_DISPLAY}; ` +
    `font-size:24px; line-height:1.3; font-weight:700; color:${DUSK.moonlight};">` +
    `${escapeHtml(text)}</h1>`
  );
}

/**
 * A body paragraph in the body font on dim text. The `html` argument is treated
 * as ALREADY-SAFE HTML: callers must escape any user-controlled input (via
 * {@link escapeHtml}) before passing it here. This lets renderers embed trusted
 * inline markup (e.g. `<strong>`) while keeping the escape chokepoint explicit.
 */
export function paragraph(html: string): string {
  return (
    `<p style="margin:0 0 16px 0; padding:0; font-family:${FONT_BODY}; ` +
    `font-size:16px; line-height:1.6; color:${DUSK.dim};">${html}</p>`
  );
}

/**
 * A bulletproof, table-based gold CTA button: dark canvas text on pollen-gold for
 * contrast, rounded via inline style, with an MSO/Outlook conditional fallback so
 * Outlook still renders the gold fill (it ignores `border-radius`/padding on `<a>`).
 *
 * Both `label` and `href` are escaped before interpolation — `href` so a `"` in
 * the URL cannot break out of the attribute, `label` so it renders as literal text.
 */
export function ctaButton(label: string, href: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin:8px 0 24px 0;"><tr><td align="center" bgcolor="${DUSK.pollen}" ` +
    `style="border-radius:8px;">` +
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" ` +
    `xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" ` +
    `style="height:48px;v-text-anchor:middle;width:240px;" arcsize="16%" ` +
    `strokecolor="${DUSK.pollen}" fillcolor="${DUSK.pollen}">` +
    `<w:anchorlock/><center style="color:${DUSK.canvas};font-family:${FONT_DISPLAY};` +
    `font-size:16px;font-weight:700;">${safeLabel}</center>` +
    `</v:roundrect><![endif]-->` +
    `<!--[if !mso]><!--><a href="${safeHref}" ` +
    `style="display:inline-block; padding:14px 32px; font-family:${FONT_DISPLAY}; ` +
    `font-size:16px; font-weight:700; line-height:1; color:${DUSK.canvas}; ` +
    `text-decoration:none; border-radius:8px; background-color:${DUSK.pollen};">` +
    `${safeLabel}</a><!--<![endif]-->` +
    `</td></tr></table>`
  );
}

/**
 * The muted footer band: a "Pollendar" wordmark line and a small note explaining
 * why the recipient received the message, sitting on the surface color.
 */
export function footer(): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `border="0"><tr><td style="padding:24px 32px; border-top:1px solid ${DUSK.line};">` +
    `<p style="margin:0 0 6px 0; font-family:${FONT_DISPLAY}; font-size:15px; ` +
    `font-weight:700; color:${DUSK.pollen};">Pollendar</p>` +
    `<p style="margin:0; font-family:${FONT_BODY}; font-size:12px; line-height:1.5; ` +
    `color:${DUSK.mute};">You received this email because someone used this address ` +
    `with Pollendar. If that wasn&#39;t you, you can safely ignore it.</p>` +
    `</td></tr></table>`
  );
}

/**
 * Wrap inner body HTML in the full bulletproof dark-email document: doctype,
 * color-scheme metas, hidden preheader, a 100% outer table on the dusk canvas, a
 * centered ~600px surface card with a line border, the body content, and the
 * footer. Every element is styled INLINE; there is no `<style>` block.
 */
export function renderShell(opts: {
  preheaderText: string;
  bodyHtml: string;
}): string {
  return (
    `<!DOCTYPE html>\n` +
    `<html lang="en" style="margin:0; padding:0;">\n` +
    `<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">\n` +
    `<meta http-equiv="X-UA-Compatible" content="IE=edge">\n` +
    `<meta name="color-scheme" content="dark">\n` +
    `<meta name="supported-color-schemes" content="dark">\n` +
    `</head>\n` +
    `<body bgcolor="${DUSK.canvas}" ` +
    `style="margin:0; padding:0; width:100%; background-color:${DUSK.canvas};">\n` +
    preheader(opts.preheaderText) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `border="0" bgcolor="${DUSK.canvas}" ` +
    `style="width:100%; background-color:${DUSK.canvas};">` +
    `<tr><td align="center" style="padding:32px 16px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" ` +
    `border="0" bgcolor="${DUSK.surface}" ` +
    `style="width:600px; max-width:600px; background-color:${DUSK.surface}; ` +
    `border:1px solid ${DUSK.line}; border-radius:12px; overflow:hidden;">` +
    `<tr><td style="padding:32px 32px 8px 32px;">${opts.bodyHtml}</td></tr>` +
    `<tr><td style="padding:0;">${footer()}</td></tr>` +
    `</table>` +
    `</td></tr></table>\n` +
    `</body>\n` +
    `</html>`
  );
}
