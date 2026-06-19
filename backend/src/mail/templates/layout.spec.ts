import { DUSK } from './tokens';
import {
  escapeHtml,
  preheader,
  heading,
  paragraph,
  ctaButton,
  footer,
  renderShell,
} from './layout';

describe('email layout helpers', () => {
  describe('escapeHtml', () => {
    it('escapes the five HTML-significant characters', () => {
      const out = escapeHtml(`<script>alert('x')&""`);
      expect(out).not.toContain('<script>');
      expect(out).not.toContain('<');
      expect(out).not.toContain('>');
      expect(out).toContain('&lt;');
      expect(out).toContain('&gt;');
      expect(out).toContain('&quot;');
      expect(out).toContain('&#39;');
    });

    it('escapes & first so entities are not double-escaped', () => {
      expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
    });

    it('leaves plain text untouched', () => {
      expect(escapeHtml('Team sync')).toBe('Team sync');
    });
  });

  describe('ctaButton', () => {
    const label = 'Open Poll';
    const href = 'https://x.test/p?q="onmouseover';
    const html = ctaButton(label, href);

    it('escapes the href so the unescaped quote cannot break the attribute', () => {
      expect(html).not.toContain('q="onmouseover');
      expect(html).toContain('q=&quot;onmouseover');
    });

    it('renders the label text and the gold fill color', () => {
      expect(html).toContain('Open Poll');
      expect(html).toContain('#FFC857');
      expect(html).toContain(DUSK.pollen);
    });

    it('includes an MSO/Outlook conditional fallback', () => {
      expect(html).toContain('<!--[if mso]>');
      expect(html).toContain('v:roundrect');
    });

    it('escapes a label containing markup to literal text', () => {
      const out = ctaButton('<b>Go</b>', 'https://x.test');
      expect(out).not.toContain('<b>Go</b>');
      expect(out).toContain('&lt;b&gt;Go&lt;/b&gt;');
    });
  });

  describe('preheader', () => {
    it('hides the span and escapes its text', () => {
      const out = preheader('A <secret> & note');
      expect(out).toContain('display:none');
      expect(out).toContain('mso-hide:all');
      expect(out).toContain('A &lt;secret&gt; &amp; note');
      expect(out).not.toContain('<secret>');
    });
  });

  describe('heading', () => {
    it('escapes its text and uses moonlight color', () => {
      const out = heading('Hi <there>');
      expect(out).toContain('&lt;there&gt;');
      expect(out).not.toContain('<there>');
      expect(out).toContain(DUSK.moonlight);
    });
  });

  describe('paragraph', () => {
    it('treats its argument as already-safe HTML and uses dim color', () => {
      const out = paragraph('Final slot: <strong>Mon</strong>');
      expect(out).toContain('<strong>Mon</strong>');
      expect(out).toContain(DUSK.dim);
    });
  });

  describe('footer', () => {
    it('renders the Pollendar wordmark and a muted note', () => {
      const out = footer();
      expect(out).toContain('Pollendar');
      expect(out).toContain(DUSK.mute);
      expect(out).toContain('received this email');
    });
  });

  describe('renderShell', () => {
    const bodyHtml = '<p data-marker="body">inner content</p>';
    const preheaderText = 'Your sign-in link is ready';
    const out = renderShell({ preheaderText, bodyHtml });

    it('starts with the doctype', () => {
      expect(out.startsWith('<!DOCTYPE')).toBe(true);
    });

    it('declares the bulletproof color-scheme metas', () => {
      expect(out).toContain('color-scheme');
      expect(out).toContain('supported-color-schemes');
    });

    it('paints the dusk canvas', () => {
      expect(out).toContain('#14122B');
      expect(out).toContain(DUSK.canvas);
    });

    it('embeds the provided body HTML', () => {
      expect(out).toContain(bodyHtml);
    });

    it('embeds the hidden preheader text', () => {
      expect(out).toContain(preheaderText);
      expect(out).toContain('mso-hide:all');
    });

    it('contains no <style> block', () => {
      expect(out).not.toContain('<style');
    });
  });
});
