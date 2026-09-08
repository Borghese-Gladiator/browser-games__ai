import { describe, it, expect } from 'vitest';
import { validateOptions } from './options.js';
import type { OptionsSchema } from './options.ts';

const schema = {
  stakes: { type: 'enum', values: ['low', 'normal', 'high'], default: 'normal' },
  hands: { type: 'int', min: 1, max: 10, default: 3 },
  ranked: { type: 'boolean', default: false },
} satisfies OptionsSchema;

describe('validateOptions', () => {
  it('returns {} when there is no schema', () => {
    expect(validateOptions(undefined, { stakes: 'high' })).toEqual({});
  });

  it('fills defaults for omitted keys', () => {
    expect(validateOptions(schema, {})).toEqual({ stakes: 'normal', hands: 3, ranked: false });
  });

  it('keeps only schema keys, dropping unknowns', () => {
    const out = validateOptions(schema, { stakes: 'high', bogus: 42 });
    expect(out).toEqual({ stakes: 'high', hands: 3, ranked: false });
    expect(out).not.toHaveProperty('bogus');
  });

  it('rejects an out-of-set enum value', () => {
    expect(() => validateOptions(schema, { stakes: 'insane' })).toThrow(/invalid option stakes/);
  });

  it('rejects a non-integer int', () => {
    expect(() => validateOptions(schema, { hands: 2.5 })).toThrow(/must be an integer/);
  });

  it('rejects an int below min and above max', () => {
    expect(() => validateOptions(schema, { hands: 0 })).toThrow(/below min/);
    expect(() => validateOptions(schema, { hands: 99 })).toThrow(/above max/);
  });

  it('rejects a non-boolean boolean', () => {
    expect(() => validateOptions(schema, { ranked: 'yes' })).toThrow(/must be a boolean/);
  });

  it('throws when a no-default key is missing', () => {
    const req = { ruleset: { type: 'enum', values: ['a', 'b'] } } satisfies OptionsSchema;
    expect(() => validateOptions(req, {})).toThrow(/missing option: ruleset/);
  });
});
