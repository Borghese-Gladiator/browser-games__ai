import { describe, it, expect } from 'vitest';
import { createTaiwaneseTileSet } from './tile-set.js';
import { tileToKind } from './tile-kind.js';

describe('createTaiwaneseTileSet', () => {
  const tiles = createTaiwaneseTileSet();

  it('has exactly 144 tiles', () => {
    expect(tiles).toHaveLength(144);
  });

  it('gives every physical tile a unique id', () => {
    const ids = tiles.map((tile) => tile.id);
    expect(new Set(ids).size).toBe(144);
  });

  it('has 4 copies of each rank in every number suit', () => {
    for (const suit of ['characters', 'bamboo', 'dots'] as const) {
      for (let rank = 1; rank <= 9; rank++) {
        const count = tiles.filter((tile) => tile.suit === suit && tile.rank === rank).length;
        expect(count).toBe(4);
      }
    }
  });

  it('has 4 copies of each wind and dragon', () => {
    for (const honor of ['east', 'south', 'west', 'north', 'red', 'green', 'white'] as const) {
      const count = tiles.filter((tile) => tile.suit === 'honor' && tile.honor === honor).length;
      expect(count).toBe(4);
    }
  });

  it('has 8 distinct flowers with one copy each', () => {
    const flowers = tiles.filter((tile) => tile.suit === 'flower');
    expect(flowers).toHaveLength(8);
    expect(new Set(flowers.map((tile) => tile.flower)).size).toBe(8);
  });

  it('splits the set into 108 number, 28 honor, and 8 flower tiles', () => {
    const numbers = tiles.filter((tile) => tile.rank !== undefined).length;
    const honors = tiles.filter((tile) => tile.suit === 'honor').length;
    const flowers = tiles.filter((tile) => tile.suit === 'flower').length;
    expect(numbers).toBe(108);
    expect(honors).toBe(28);
    expect(flowers).toBe(8);
  });

  it('normalizes to exactly 4 copies of each non-flower TileKind', () => {
    const counts = new Map<string, number>();
    for (const tile of tiles) {
      if (tile.suit === 'flower') continue;
      const kind = tileToKind(tile);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    expect(counts.size).toBe(34);
    for (const count of counts.values()) {
      expect(count).toBe(4);
    }
  });
});
