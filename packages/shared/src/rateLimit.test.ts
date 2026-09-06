import { describe, it, expect } from 'vitest';
import { TokenBucket } from './rateLimit.js';

describe('TokenBucket', () => {
  const now = 1_000_000;

  it('allows a burst up to capacity', () => {
    const b = new TokenBucket({ capacity: 3, refillRate: 1, refillIntervalMs: 1000, now });
    expect(b.consume(now)).toBe(true);
    expect(b.consume(now)).toBe(true);
    expect(b.consume(now)).toBe(true);
  });

  it('throttles once the bucket empties', () => {
    const b = new TokenBucket({ capacity: 2, refillRate: 1, refillIntervalMs: 1000, now });
    expect(b.consume(now)).toBe(true);
    expect(b.consume(now)).toBe(true);
    expect(b.consume(now)).toBe(false);
  });

  it('refills tokens after an interval', () => {
    const b = new TokenBucket({ capacity: 2, refillRate: 1, refillIntervalMs: 1000, now });
    expect(b.consume(now)).toBe(true);
    expect(b.consume(now)).toBe(true);
    expect(b.consume(now)).toBe(false);
    expect(b.consume(now + 1000)).toBe(true);
    expect(b.consume(now + 1000)).toBe(false);
  });

  it('never exceeds capacity on long idle', () => {
    const b = new TokenBucket({ capacity: 2, refillRate: 5, refillIntervalMs: 1000, now });
    expect(b.consume(now + 100_000)).toBe(true);
    expect(b.consume(now + 100_000)).toBe(true);
    expect(b.consume(now + 100_000)).toBe(false);
  });
});
