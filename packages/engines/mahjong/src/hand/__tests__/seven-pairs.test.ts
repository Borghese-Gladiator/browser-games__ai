import { describe, it, expect } from 'vitest';
import { DEFAULT_TAIWANESE_RULES } from '../../rules/taiwanese.js';
import { toTileCounts } from '../counts.js';
import { decomposeSevenPairs, isSevenPairs } from '../winning-patterns/seven-pairs.js';
import { tiles } from './helpers.js';

const EIGHT_PAIRS = '1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 7m 8m 8m';

describe('isSevenPairs', () => {
  it('accepts the 16-tile eight-pairs shape', () => {
    expect(isSevenPairs(toTileCounts(tiles(EIGHT_PAIRS)), DEFAULT_TAIWANESE_RULES)).toBe(true);
  });

  it('rejects the Japanese 14-tile seven-pairs shape', () => {
    const japanese = '1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 7m';
    expect(isSevenPairs(toTileCounts(tiles(japanese)), DEFAULT_TAIWANESE_RULES)).toBe(false);
  });

  it('rejects a hand with an odd count', () => {
    const odd = '1m 1m 1m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 7m 8m 8m';
    expect(isSevenPairs(toTileCounts(tiles(odd)), DEFAULT_TAIWANESE_RULES)).toBe(false);
  });

  it('returns false when the rule is disabled', () => {
    const rules = { ...DEFAULT_TAIWANESE_RULES, sevenPairsEnabled: false };
    expect(isSevenPairs(toTileCounts(tiles(EIGHT_PAIRS)), rules)).toBe(false);
  });
});

describe('decomposeSevenPairs', () => {
  it('returns one decomposition of eight pairs', () => {
    const decompositions = decomposeSevenPairs(
      toTileCounts(tiles(EIGHT_PAIRS)),
      DEFAULT_TAIWANESE_RULES,
    );
    expect(decompositions).toHaveLength(1);
    expect(decompositions[0].pattern).toBe('SEVEN_PAIRS');
    expect(decompositions[0].melds).toHaveLength(7);
    expect(decompositions[0].melds.every((one) => one.kind === 'pair')).toBe(true);
  });

  it('returns nothing for a non-pairs hand', () => {
    const decompositions = decomposeSevenPairs(
      toTileCounts(tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 1p')),
      DEFAULT_TAIWANESE_RULES,
    );
    expect(decompositions).toHaveLength(0);
  });
});
