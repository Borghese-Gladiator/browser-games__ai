import { describe, it, expect } from 'vitest';
import { DEFAULT_TAIWANESE_RULES } from '../../rules/taiwanese.js';
import { toTileCounts } from '../counts.js';
import { isWinningHand } from '../winning.js';
import { isSevenPairs } from './seven-pairs.js';
import { tiles } from '../test-helpers.js';

const EIGHT_PAIRS = '1s 1s 2s 2s 3s 3s 4s 4s 5s 5s 6s 6s 7s 7s 8s 8s';
const TERMINALS_AND_HONORS =
  'east east east 1m 1m 9m 9m 1s 1s 9s 9s 1p 1p 9p 9p south south';
const STANDARD_HAND = '1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 1p 1p';
const DUAL_HAND = '1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 7m east east east';

describe('isWinningHand — all-pairs (seven pairs)', () => {
  it('does not treat a 16-tile eight-pairs hand as a win', () => {
    const result = isWinningHand({
      concealed: tiles(EIGHT_PAIRS),
      exposedMelds: [],
    });
    expect(result.winning).toBe(false);
    expect(result.pattern).toBeNull();
    expect(result.decompositions).toHaveLength(0);
  });

  it('recognizes a 17-tile terminals-and-honors hand as SEVEN_PAIRS', () => {
    const result = isWinningHand({
      concealed: tiles(TERMINALS_AND_HONORS),
      exposedMelds: [],
    });
    expect(result.winning).toBe(true);
    expect(result.pattern).toBe('SEVEN_PAIRS');
    expect(result.decompositions.every((one) => one.pattern === 'SEVEN_PAIRS')).toBe(true);
  });

  it('returns both decompositions when a hand is standard and all-pairs', () => {
    const result = isWinningHand({
      concealed: tiles(DUAL_HAND),
      exposedMelds: [],
    });
    expect(result.winning).toBe(true);
    expect(result.pattern).toBe('STANDARD');
    expect(result.decompositions.some((one) => one.pattern === 'STANDARD')).toBe(true);
    expect(result.decompositions.some((one) => one.pattern === 'SEVEN_PAIRS')).toBe(true);
  });

  it('recognizes a 17-tile standard hand as STANDARD', () => {
    const result = isWinningHand({
      concealed: tiles(STANDARD_HAND),
      exposedMelds: [],
    });
    expect(result.winning).toBe(true);
    expect(result.pattern).toBe('STANDARD');
  });
});

describe('isSevenPairs', () => {
  it('accepts a 17-tile seven-pairs-plus-triplet hand but not a 16-tile eight-pairs hand', () => {
    expect(isSevenPairs(toTileCounts(tiles(TERMINALS_AND_HONORS)), DEFAULT_TAIWANESE_RULES)).toBe(
      true,
    );
    expect(isSevenPairs(toTileCounts(tiles(EIGHT_PAIRS)), DEFAULT_TAIWANESE_RULES)).toBe(false);
  });
});
