import { describe, it, expect } from 'vitest';
import { tiles } from '../test-helpers.ts';
import { completionDistance } from './distance.ts';

describe('completionDistance', () => {
  it.each([
    ['1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 7s', 0],
    ['1m 1m 1m 2m 3m 4m 5s 6s 7s 8p 8p 9p 9p east east south', 1],
    ['1m 1m east south west north red green white 2p 4p 6p 8p 9s 7s', 6],
  ])('returns the shanten distance for %s', (spec, expected) => {
    expect(completionDistance({ concealed: tiles(spec), exposedMelds: [] })).toBe(expected);
  });

  it('returns identical output for identical input', () => {
    const spec = '1m 1m 1m 2m 3m 4m 5s 6s 7s 8p 8p 9p 9p east east south';
    const first = completionDistance({ concealed: tiles(spec), exposedMelds: [] });
    const second = completionDistance({ concealed: tiles(spec), exposedMelds: [] });
    expect(first).toBe(second);
  });
});
