/**
 * Dusk Calendar theme tokens for branded transactional emails.
 *
 * A frozen hex-color palette plus the two web-safe font-family fallback chains
 * (display + body). These are the single source of truth the layout helpers and
 * per-email renderers interpolate inline — there is no `<style>` block, no
 * external CSS, and no webfont `@import`/`<link>` (Google Fonts will not load in
 * most email clients, so the fallback chains MUST stand on their own).
 */

/** The frozen Dusk Calendar palette. */
export const DUSK = {
  canvas: '#14122B',
  surface: '#211E40',
  surface2: '#2B2752',
  line: '#36325E',
  pollen: '#FFC857',
  pollenDeep: '#F0A93B',
  moonlight: '#F4F2FF',
  dim: '#B8B3DE',
  mute: '#7E79AE',
  mint: '#6FE0B0',
  coral: '#FF7A6B',
} as const;

/**
 * Display font chain for headings/numerals. Space Grotesk leads, but it will not
 * load in most email clients, so the web-safe fallbacks carry the look on their own.
 */
export const FONT_DISPLAY =
  "'Space Grotesk', Georgia, 'Times New Roman', Arial, sans-serif";

/**
 * Body font chain for prose. Inter leads, with web-safe fallbacks that stand alone
 * when the webfont does not load.
 */
export const FONT_BODY = "'Inter', Arial, Helvetica, sans-serif";
