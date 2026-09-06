import { describe, it, expect } from 'vitest';
import { isWinningHand, findWinningDecompositions } from '../winning.js';
import { meld, tiles } from './helpers.js';

describe('isWinningHand', () => {
  it('recognizes a standard win', () => {
    const result = isWinningHand({
      concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 1p 1p'),
      exposedMelds: [],
    });
    expect(result.winning).toBe(true);
    expect(result.pattern).toBe('STANDARD');
    expect(result.decompositions.length).toBeGreaterThan(0);
  });

  it('recognizes a standard win with an exposed meld', () => {
    const result = isWinningHand({
      concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 1p 1p'),
      exposedMelds: [meld('pong', '9p 9p 9p')],
    });
    expect(result.winning).toBe(true);
    expect(result.pattern).toBe('STANDARD');
    expect(result.decompositions[0].melds).toHaveLength(5);
    expect(result.decompositions[0].melds[0].concealed).toBe(false);
  });

  it('reports every valid decomposition', () => {
    const result = isWinningHand({
      concealed: tiles('2m 2m 2m 3m 3m 3m 4m 4m 4m 6p 6p 6p 7s 7s 7s east east'),
      exposedMelds: [],
    });
    expect(result.decompositions).toHaveLength(2);
  });

  it('reports seven pairs as SEVEN_PAIRS, never STANDARD', () => {
    const result = isWinningHand({
      concealed: tiles('1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 7m 8m 8m'),
      exposedMelds: [],
    });
    expect(result.winning).toBe(true);
    expect(result.pattern).toBe('SEVEN_PAIRS');
    expect(result.decompositions.every((one) => one.pattern === 'SEVEN_PAIRS')).toBe(true);
  });

  it('rejects an invalid hand', () => {
    const result = isWinningHand({
      concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 1p 2p'),
      exposedMelds: [],
    });
    expect(result.winning).toBe(false);
    expect(result.pattern).toBeNull();
    expect(result.decompositions).toHaveLength(0);
  });
});

describe('findWinningDecompositions', () => {
  it('returns decompositions across both patterns without a verdict wrapper', () => {
    const decompositions = findWinningDecompositions({
      concealed: tiles('1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 7m 8m 8m'),
      exposedMelds: [],
    });
    expect(decompositions).toHaveLength(1);
    expect(decompositions[0].pattern).toBe('SEVEN_PAIRS');
  });
});
