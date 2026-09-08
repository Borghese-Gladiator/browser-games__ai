import { describe, it, expect } from 'vitest';
import { toTileCounts } from '../counts.js';
import { decomposeStandard } from './standard.js';
import { tiles } from '../test-helpers.js';

describe('decomposeStandard', () => {
  it('finds the single decomposition of a plain hand', () => {
    const counts = toTileCounts(tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 1p 1p'));
    const decompositions = decomposeStandard(counts, 5);
    expect(decompositions).toHaveLength(1);
    expect(decompositions[0].melds).toHaveLength(5);
    expect(decompositions[0].pair).toEqual(['1p', '1p']);
  });

  it('returns every valid decomposition when a block is ambiguous', () => {
    const counts = toTileCounts(
      tiles('2m 2m 2m 3m 3m 3m 4m 4m 4m 6p 6p 6p 7s 7s 7s east east'),
    );
    const decompositions = decomposeStandard(counts, 5);
    expect(decompositions).toHaveLength(2);
    const shapes = decompositions.map((decomposition) =>
      decomposition.melds
        .filter((one) => one.tiles[0].endsWith('m'))
        .map((one) => one.kind)
        .sort()
        .join(','),
    );
    expect(shapes).toContain('pong,pong,pong');
    expect(shapes).toContain('chow,chow,chow');
  });

  it('honors already-formed melds by needing fewer melds', () => {
    const counts = toTileCounts(tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 1p 1p'));
    const decompositions = decomposeStandard(counts, 4);
    expect(decompositions).toHaveLength(1);
    expect(decompositions[0].melds).toHaveLength(4);
  });

  it('rejects a hand that cannot form melds plus a pair', () => {
    const counts = toTileCounts(tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 1p 2p'));
    expect(decomposeStandard(counts, 5)).toHaveLength(0);
  });

  it('rejects a hand with the wrong tile total', () => {
    const counts = toTileCounts(tiles('1m 2m 3m 1p 1p'));
    expect(decomposeStandard(counts, 5)).toHaveLength(0);
  });
});
