import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Pins the near-flat pollen-glow design tokens decided for the "calm glow" pass.
// These are global stylesheet values that component-render tests don't evaluate,
// so a future edit could silently re-inflate the glow; this guards against that.
// Vitest's `root` is the frontend dir, so resolve main.css relative to cwd.
const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

describe('calm-glow design tokens (main.css)', () => {
  it('uses a single 1px pollen ring with no outer halo for --shadow-glow', () => {
    expect(css).toContain('--shadow-glow: 0 0 0 1px rgb(255 200 87 / 0.40);')
    // No 28px (or any large) halo layer remains.
    expect(css).not.toContain('0 0 28px')
  })

  it('keeps the .pollen-dot glow tiny (4px / 0.30)', () => {
    expect(css).toContain('box-shadow: 0 0 4px rgb(255 200 87 / 0.30);')
    expect(css).not.toContain('0 0 8px')
  })

  it('lowers the .bloom-bg radial peak alpha to 0.05', () => {
    expect(css).toContain('rgb(255 200 87 / 0.05)')
    expect(css).not.toContain('rgb(255 200 87 / 0.16)')
  })

  it('halves the .bg-dusk page washes (pollen 0.05, indigo 0.06)', () => {
    expect(css).toContain('rgb(255 200 87 / 0.05), transparent 60%')
    expect(css).toContain('rgb(124 138 224 / 0.06), transparent 60%')
  })

  it('leaves the bloom animation timing and reduced-motion guard intact', () => {
    expect(css).toContain('--animate-bloom: bloom 0.25s ease-out;')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    // The bloom keyframe still fades the ring in from zero to the token value.
    expect(css).toContain('box-shadow: 0 0 0 0 rgb(255 200 87 / 0);')
    expect(css).toContain('box-shadow: var(--shadow-glow);')
  })

  it('does not touch the card-elevation shadow', () => {
    expect(css).toContain('--shadow-card: 0 8px 24px rgb(0 0 0 / 0.35);')
  })
})
