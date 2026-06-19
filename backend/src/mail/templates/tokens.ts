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
 * Display font chain for headings/numerals. Space Grotesk (a geometric *sans*-serif)
 * leads to match the browser app, but it will not load in most email clients, so the
 * fallbacks are the same system-sans stack the frontend resolves to (`ui-sans-serif,
 * sans-serif`) — NEVER a serif. Mirrors `--font-display` in frontend/src/assets/main.css.
 */
export const FONT_DISPLAY =
  "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Body font chain for prose. Inter leads to match the browser app, with the same
 * system-sans fallbacks that stand alone when the webfont does not load. Mirrors
 * `--font-sans` in frontend/src/assets/main.css.
 */
export const FONT_BODY =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
