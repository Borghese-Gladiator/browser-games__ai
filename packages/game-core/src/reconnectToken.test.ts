import { describe, it, expect } from 'vitest';
import { mintReconnectToken, verifyReconnectToken } from './reconnectToken.ts';

describe('mintReconnectToken', () => {
  it('returns a 64-char hex string', () => {
    expect(mintReconnectToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns a different value on each call', () => {
    expect(mintReconnectToken()).not.toBe(mintReconnectToken());
  });
});

describe('verifyReconnectToken', () => {
  it('is true for an exact match', () => {
    const t = mintReconnectToken();
    expect(verifyReconnectToken(t, t)).toBe(true);
  });

  it('is false for a mismatch of equal length', () => {
    const a = mintReconnectToken();
    const b = mintReconnectToken();
    expect(verifyReconnectToken(a, b)).toBe(false);
  });

  it('is false on a length mismatch', () => {
    expect(verifyReconnectToken('abcd', 'abcde')).toBe(false);
  });

  it('is false when either side is null or undefined', () => {
    const t = mintReconnectToken();
    expect(verifyReconnectToken(null, t)).toBe(false);
    expect(verifyReconnectToken(t, null)).toBe(false);
    expect(verifyReconnectToken(undefined, undefined)).toBe(false);
  });
});
