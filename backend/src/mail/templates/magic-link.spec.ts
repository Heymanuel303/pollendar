import { renderMagicLink } from './magic-link';

describe('renderMagicLink (plain-voice copy)', () => {
  const link = 'http://localhost:5173/auth/verify?token=abc123';
  const out = renderMagicLink(link);

  it('uses the plain sign-in body sentence with no em dash', () => {
    expect(out.html).toContain(
      'This link is for you alone. No password required.',
    );
    expect(out.html).not.toContain('—');
  });

  it('keeps the established subject and preheader', () => {
    expect(out.subject).toBe('Your Pollendar sign-in link');
    expect(out.html).toContain('Your one-time sign-in link for Pollendar');
  });
});
