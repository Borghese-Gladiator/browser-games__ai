import { describe, it, expect } from 'vitest';
import { tiles } from '../test-helpers.ts';
import { improvingTiles } from './improving-tiles.ts';

describe('improvingTiles', () => {
  it.each([
    ['1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s 7s', 8],
    ['1m 1m 1m 2m 3m 4m 5s 6s 7s 8p 8p 9p 9p east east south', 4],
    ['1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 4s 5s', 7],
  ])('counts the improving tile kinds for %s', (spec, expected) => {
    const result = improvingTiles({ concealed: tiles(spec), exposedMelds: [] });
    expect(result.count).toBe(expected);
    expect(result.kinds).toHaveLength(expected);
  });

  it('lists the exact improving kinds in a stable order', () => {
    const result = improvingTiles({
      concealed: tiles('1m 1m 1m 2m 3m 4m 5s 6s 7s 8p 8p 9p 9p east east south'),
      exposedMelds: [],
    });
    expect(result.kinds).toEqual(['7p', '8p', '9p', 'east']);
  });

  it('returns identical output for identical input', () => {
    const spec = '1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 4s 5s';
    const first = improvingTiles({ concealed: tiles(spec), exposedMelds: [] });
    const second = improvingTiles({ concealed: tiles(spec), exposedMelds: [] });
    expect(first).toEqual(second);
  });
});
