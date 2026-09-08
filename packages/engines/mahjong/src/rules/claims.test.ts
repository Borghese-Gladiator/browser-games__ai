import { describe, it, expect } from 'vitest';
import { DEFAULT_TAIWANESE_RULES } from './taiwanese.ts';
import type { Claim } from './claims.ts';
import { claimRank, isChowSeat, resolveClaims } from './claims.ts';

const rules = DEFAULT_TAIWANESE_RULES;

describe('claimRank', () => {
  it('ranks WIN over kong and pong over chow', () => {
    expect(claimRank('WIN')).toBeGreaterThan(claimRank('KONG'));
    expect(claimRank('KONG')).toBe(claimRank('PONG'));
    expect(claimRank('PONG')).toBeGreaterThan(claimRank('CHOW'));
  });
});

describe('isChowSeat', () => {
  it('only accepts the seat to the left of the discarder', () => {
    expect(isChowSeat(1, 0, rules)).toBe(true);
    expect(isChowSeat(2, 0, rules)).toBe(false);
    expect(isChowSeat(0, 3, rules)).toBe(true);
  });
});

describe('resolveClaims', () => {
  it('lets a pong beat a chow on the same discard', () => {
    const claims: Claim[] = [
      { seat: 1, type: 'CHOW' },
      { seat: 2, type: 'PONG' },
    ];
    expect(resolveClaims(claims, 0, rules)).toEqual({ seat: 2, type: 'PONG' });
  });

  it('lets a win beat a pong', () => {
    const claims: Claim[] = [
      { seat: 2, type: 'PONG' },
      { seat: 3, type: 'WIN' },
    ];
    expect(resolveClaims(claims, 0, rules)).toEqual({ seat: 3, type: 'WIN' });
  });

  it('resolves two pongs deterministically by nearest seat to the discarder', () => {
    const claims: Claim[] = [
      { seat: 3, type: 'PONG' },
      { seat: 2, type: 'PONG' },
    ];
    expect(resolveClaims(claims, 0, rules)).toEqual({ seat: 2, type: 'PONG' });
    expect(resolveClaims([...claims].reverse(), 0, rules)).toEqual({ seat: 2, type: 'PONG' });
  });

  it('ignores a chow from a seat that is not left of the discarder', () => {
    expect(resolveClaims([{ seat: 2, type: 'CHOW' }], 0, rules)).toBeNull();
    expect(resolveClaims([{ seat: 1, type: 'CHOW' }], 0, rules)).toEqual({
      seat: 1,
      type: 'CHOW',
    });
  });

  it('returns null when no claim is valid', () => {
    expect(resolveClaims([], 0, rules)).toBeNull();
  });
});
