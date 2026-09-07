import { describe, it, expect } from 'vitest';
import { MAX_ATTEMPTS, nextDelay, shouldReconnect } from './reconnect.ts';

describe('nextDelay', () => {
  it('stays within the jittered [base, max] range', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const d = nextDelay(attempt, { base: 500, max: 30_000 });
      const ceil = Math.min(500 * 2 ** attempt, 30_000);
      expect(d).toBeGreaterThanOrEqual(ceil * 0.85);
      expect(d).toBeLessThanOrEqual(ceil * 1.15);
    }
  });

  it('grows with attempt count up to the cap', () => {
    const a = nextDelay(0, { base: 500, max: 30_000 });
    const b = nextDelay(5, { base: 500, max: 30_000 });
    expect(b).toBeGreaterThan(a);
  });
});

describe('shouldReconnect', () => {
  it('is true below MAX_ATTEMPTS', () => {
    expect(shouldReconnect(0)).toBe(true);
    expect(shouldReconnect(MAX_ATTEMPTS - 1)).toBe(true);
  });

  it('is false at or above MAX_ATTEMPTS', () => {
    expect(shouldReconnect(MAX_ATTEMPTS)).toBe(false);
    expect(shouldReconnect(MAX_ATTEMPTS + 5)).toBe(false);
  });
});
