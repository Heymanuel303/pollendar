import { renderPollCompleted } from './poll-completed';

describe('renderPollCompleted (plain-voice copy)', () => {
  const pollTitle = 'Team offsite';
  const finalSlotLabel = 'Mon Jun 22, 10:00';
  const shareUrl = 'http://localhost:5173/p/abc123token0000000000';
  const out = renderPollCompleted(pollTitle, finalSlotLabel, shareUrl);

  it('uses the plain "picked a time" subject that still embeds the raw title', () => {
    expect(out.subject).toBe('Pollendar picked a time for "Team offsite"');
  });

  it('renders the "Top pick" chip label and "picked a time" heading in the HTML', () => {
    expect(out.html).toContain('Top pick');
    expect(out.html).toContain('Pollendar picked a time');
    expect(out.html).toContain('now has a chosen time');
  });

  it('renders the "Top pick" label in the plain-text part', () => {
    expect(out.text).toContain(
      'Pollendar picked a time for the poll "Team offsite".',
    );
    expect(out.text).toContain('Top pick: Mon Jun 22, 10:00');
  });

  it('carries no "finalized" / "final time" / "Final slot" wording', () => {
    const all = `${out.subject}\n${out.html}\n${out.text}`;
    expect(all).not.toMatch(/finalized/i);
    expect(all).not.toMatch(/final time/i);
    expect(all).not.toContain('Final slot');
  });

  it('escapes a markup-bearing title in the HTML but keeps it raw in subject/text', () => {
    const spicy = renderPollCompleted('<b>x</b>', finalSlotLabel, shareUrl);
    expect(spicy.html).toContain('&lt;b&gt;');
    expect(spicy.html).not.toContain('<b>x</b>');
    expect(spicy.subject).toContain('<b>x</b>');
    expect(spicy.text).toContain('<b>x</b>');
  });
});
