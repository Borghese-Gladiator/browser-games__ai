import { describe, it, expect } from 'vitest';
import { makeRng, nextSeed } from './rng.ts';

function sequence(seed: number, length: number): number[] {
  const rng = makeRng(seed);
  return Array.from({ length }, () => rng());
}

describe('makeRng', () => {
  it('returns the same sequence for the same seed', () => {
    expect(sequence(42, 5)).toEqual(sequence(42, 5));
  });

  it('returns a different sequence for a different seed', () => {
    expect(sequence(1, 5)).not.toEqual(sequence(2, 5));
  });

  it('produces values in the half-open range [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 100; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('nextSeed', () => {
  it('is deterministic for the same seed', () => {
    expect(nextSeed(42)).toBe(nextSeed(42));
  });

  it('changes the seed', () => {
    expect(nextSeed(42)).not.toBe(42);
  });

  it('returns a non-negative 32-bit integer', () => {
    const advanced = nextSeed(42);
    expect(Number.isInteger(advanced)).toBe(true);
    expect(advanced).toBeGreaterThanOrEqual(0);
    expect(advanced).toBeLessThanOrEqual(0xffffffff);
  });
});
