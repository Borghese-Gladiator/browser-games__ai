import { describe, it, expect } from 'vitest';
import { sanitizeName, MAX_NAME_LEN } from './sanitize.js';

describe('sanitizeName', () => {
  it('passes a clean name through unchanged', () => {
    expect(sanitizeName('Alice')).toBe('Alice');
  });

  it('strips control chars', () => {
    expect(sanitizeName('Ali\x01ce')).toBe('Alice');
  });

  it('strips zero-width chars', () => {
    expect(sanitizeName('Ali​ce')).toBe('Alice');
  });

  it('truncates to MAX_NAME_LEN code points', () => {
    const long = 'a'.repeat(30);
    expect(sanitizeName(long)).toHaveLength(MAX_NAME_LEN);
  });

  it('caps an emoji bomb to two emoji without throwing', () => {
    expect(sanitizeName('🔥🔥🔥🔥🔥')).toBe('🔥🔥');
  });

  it('replaces profanity', () => {
    expect(sanitizeName('shithead')).toBe('***head');
  });

  it('throws when the name is empty after stripping', () => {
    expect(() => sanitizeName('\x01\x02')).toThrow('name required');
  });

  it('throws a TypeError on non-string input', () => {
    expect(() => sanitizeName(42)).toThrow(TypeError);
  });
});
