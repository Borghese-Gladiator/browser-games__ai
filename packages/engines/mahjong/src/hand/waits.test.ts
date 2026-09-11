import { describe, it, expect } from 'vitest';
import { findWaits } from './waits.ts';
import { meld, tiles } from './test-helpers.ts';

describe('findWaits', () => {
  it('finds the pair wait of a standard hand', () => {
    const waits = findWaits({
      concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 1p'),
      exposedMelds: [],
    });
    expect(waits).toEqual(['1p']);
  });

  it('finds a two-sided sequence wait', () => {
    const waits = findWaits({
      concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 5p 5p 5p 1p 1p 2s 3s'),
      exposedMelds: [],
    });
    expect(waits).toEqual(['1s', '4s']);
  });

  it('finds the triplet waits of an eight-pairs tenpai', () => {
    const waits = findWaits({
      concealed: tiles('1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 7m 8m 8m'),
      exposedMelds: [],
    });
    expect(waits).toEqual(['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m']);
  });

  it('respects exposed melds when computing waits', () => {
    const waits = findWaits({
      concealed: tiles('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 1p'),
      exposedMelds: [meld('pong', '9p 9p 9p')],
    });
    expect(waits).toEqual(['1p']);
  });
});
