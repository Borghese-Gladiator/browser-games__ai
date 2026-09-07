import { describe, it, expect } from 'vitest';
import { createSeededRandom } from '../random/rng.ts';
import { createTaiwaneseTileSet } from './tile-set.ts';
import { shuffleTiles } from './shuffle.ts';

describe('shuffleTiles', () => {
  const tileSet = createTaiwaneseTileSet();

  it('returns a new array and keeps the source untouched', () => {
    const before = tileSet.map((tile) => tile.id);
    const shuffled = shuffleTiles(tileSet, createSeededRandom('seed'));
    expect(shuffled).not.toBe(tileSet);
    expect(shuffled).toHaveLength(144);
    expect(tileSet.map((tile) => tile.id)).toEqual(before);
  });

  it('keeps the same multiset of tiles', () => {
    const shuffled = shuffleTiles(tileSet, createSeededRandom('seed'));
    expect(new Set(shuffled.map((tile) => tile.id)).size).toBe(144);
  });

  it('produces the same order for the same seed', () => {
    const a = shuffleTiles(tileSet, createSeededRandom('table-42'));
    const b = shuffleTiles(tileSet, createSeededRandom('table-42'));
    expect(a.map((tile) => tile.id)).toEqual(b.map((tile) => tile.id));
  });

  it('produces a different order for different seeds', () => {
    const a = shuffleTiles(tileSet, createSeededRandom('table-42'));
    const b = shuffleTiles(tileSet, createSeededRandom('table-99'));
    expect(a.map((tile) => tile.id)).not.toEqual(b.map((tile) => tile.id));
  });
});
