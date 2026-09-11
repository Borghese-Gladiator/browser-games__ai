import { describe, it, expect } from 'vitest';
import { tiles } from '../test-helpers.ts';
import { rankDiscards } from './rank-discards.ts';

const SPEC = '1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 4s 5s east';

describe('rankDiscards', () => {
  it('orders an isolated honor ahead of a connected tile', () => {
    const ranked = rankDiscards({ concealed: tiles(SPEC), exposedMelds: [] });
    expect(ranked[0].kind).toBe('east');
  });

  it('sorts strictly by descending score with a kind tie-break', () => {
    const ranked = rankDiscards({ concealed: tiles(SPEC), exposedMelds: [] });
    for (let index = 1; index < ranked.length; index += 1) {
      const previous = ranked[index - 1];
      const current = ranked[index];
      const ordered =
        previous.score > current.score ||
        (previous.score === current.score && previous.kind.localeCompare(current.kind) <= 0);
      expect(ordered).toBe(true);
    }
  });

  it('sets the score equal to the sum of the reason contributions', () => {
    const [best] = rankDiscards({ concealed: tiles(SPEC), exposedMelds: [] });
    const total = best.reasons.reduce((sum, reason) => sum + reason.contribution, 0);
    expect(best.score).toBe(total);
  });

  it('returns identical output for identical input', () => {
    const first = rankDiscards({ concealed: tiles(SPEC), exposedMelds: [] });
    const second = rankDiscards({ concealed: tiles(SPEC), exposedMelds: [] });
    expect(first).toEqual(second);
  });
});
