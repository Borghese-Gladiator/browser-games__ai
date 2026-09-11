import { describe, it, expect } from 'vitest';
import { toTileCounts } from './counts.ts';
import { tiles } from './test-helpers.ts';

describe('toTileCounts', () => {
  it('counts each tile kind', () => {
    const counts = toTileCounts(tiles('1m 1m 2m 3m east'));
    expect(counts.get('1m')).toBe(2);
    expect(counts.get('2m')).toBe(1);
    expect(counts.get('3m')).toBe(1);
    expect(counts.get('east')).toBe(1);
  });

  it('returns an empty map for no tiles', () => {
    expect(toTileCounts([]).size).toBe(0);
  });
});
