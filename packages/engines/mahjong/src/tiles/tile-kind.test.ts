import { describe, it, expect } from 'vitest';
import type { Tile } from './tile.ts';
import { tileToKind } from './tile-kind.ts';

describe('tileToKind', () => {
  it.each([
    ['characters', 5, '5m'],
    ['characters', 1, '1m'],
    ['characters', 9, '9m'],
    ['bamboo', 3, '3s'],
    ['bamboo', 9, '9s'],
    ['dots', 7, '7p'],
    ['dots', 1, '1p'],
  ] as const)('maps %s rank %i to %s', (suit, rank, kind) => {
    const tile: Tile = { id: `${suit}-${rank}-1`, suit, rank };
    expect(tileToKind(tile)).toBe(kind);
  });

  it.each([
    ['east'],
    ['south'],
    ['west'],
    ['north'],
    ['red'],
    ['green'],
    ['white'],
  ] as const)('maps honor %s to itself', (honor) => {
    const tile: Tile = { id: `honor-${honor}-1`, suit: 'honor', honor };
    expect(tileToKind(tile)).toBe(honor);
  });

  it('throws for a flower tile', () => {
    const tile: Tile = { id: 'flower-plum-1', suit: 'flower', flower: 'plum' };
    expect(() => tileToKind(tile)).toThrow();
  });
});
