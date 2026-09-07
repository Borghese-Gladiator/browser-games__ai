import { describe, it, expect } from 'vitest';
import { isSlowGame, rollupMessagesPerSec, SLOW_GAME_THRESHOLD_MS } from './metrics.js';

describe('isSlowGame', () => {
  it('returns false when phaseEnteredAt is null', () => {
    expect(isSlowGame(null, Date.now(), SLOW_GAME_THRESHOLD_MS)).toBe(false);
  });

  it('returns false just before the threshold', () => {
    expect(isSlowGame(0, SLOW_GAME_THRESHOLD_MS - 1, SLOW_GAME_THRESHOLD_MS)).toBe(false);
  });

  it('returns true at the threshold', () => {
    expect(isSlowGame(0, SLOW_GAME_THRESHOLD_MS, SLOW_GAME_THRESHOLD_MS)).toBe(true);
  });
});

describe('rollupMessagesPerSec', () => {
  it('computes messages per second', () => {
    expect(rollupMessagesPerSec(10, 1000)).toBe(10);
    expect(rollupMessagesPerSec(10, 2000)).toBe(5);
  });

  it('returns 0 for zero count', () => {
    expect(rollupMessagesPerSec(0, 1000)).toBe(0);
  });

  it('returns 0 for non-positive elapsed', () => {
    expect(rollupMessagesPerSec(5, 0)).toBe(0);
  });
});
