import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'theme.css'), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`theme.css defines no --${name}`);
  const value = match[1].trim();
  const alias = value.match(/^var\(--([a-z0-9-]+)\)$/);
  return alias ? token(alias[1]) : value;
}

function channels(hex: string): [number, number, number] {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`not a six-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black at `alpha` over `ground` — the plate a severity badge sits on. */
function plate(ground: string, alpha: number): string {
  const hex = channels(ground)
    .map((c) => Math.round(c * (1 - alpha)))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

const AA = 4.5;
const AA_LARGE = 3;

describe('theme contrast', () => {
  // The grounds a caption can land on. --surface-3 is a hover fill, never a
  // resting text ground, so it is not in this list.
  const grounds = ['bg', 'bg-2', 'surface', 'surface-2'] as const;

  it.each(['text', 'text-dim', 'muted'])(
    '--%s carries body text on every resting ground',
    (ink) => {
      for (const ground of grounds) {
        expect(contrast(token(ink), token(ground)), `--${ink} on --${ground}`).toBeGreaterThanOrEqual(
          AA,
        );
      }
    },
  );

  // --faint is inert chrome: borders, pips, dots and disabled labels. It is
  // deliberately below AA, and nothing may use it for readable text. This
  // asserts the intent so a later edit cannot quietly promote it.
  it('--faint stays below AA, so it is never mistaken for a text token', () => {
    expect(contrast(token('faint'), token('bg'))).toBeLessThan(AA);
  });

  it.each([
    ['on-gold', 'gold'],
    ['on-jade', 'jade-2'],
  ])('--%s reads on a filled --%s surface', (ink, fill) => {
    expect(contrast(token(ink), token(fill))).toBeGreaterThanOrEqual(AA);
  });

  it('--text reads on the filled alert background', () => {
    expect(contrast(token('text'), token('vermilion-deep'))).toBeGreaterThanOrEqual(AA);
  });

  describe('severity ramp', () => {
    const steps = ['sev-optimal', 'sev-minor', 'sev-moderate', 'sev-severe'] as const;

    it.each(steps)('--%s reads as badge text on the dark plate', (step) => {
      const felt = plate(token('jade-felt-2'), 0.4);
      expect(contrast(token(step), felt), `--${step} on the felt plate`).toBeGreaterThanOrEqual(AA);
      expect(contrast(token(step), token('surface-2')), `--${step} on --surface-2`).toBeGreaterThanOrEqual(
        AA,
      );
    });

    it.each(steps)('--%s reads as a swatch on bare felt', (step) => {
      expect(contrast(token(step), token('jade-felt-2'))).toBeGreaterThanOrEqual(AA_LARGE);
    });
  });

  it('a near-black game piece is visible on the reversi felt', () => {
    expect(contrast(token('bg'), token('jade-felt-3'))).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('--jade-light reads on felt and on a panel', () => {
    expect(contrast(token('jade-light'), token('jade-felt-2'))).toBeGreaterThanOrEqual(AA);
    expect(contrast(token('jade-light'), token('surface-2'))).toBeGreaterThanOrEqual(AA);
  });
});
