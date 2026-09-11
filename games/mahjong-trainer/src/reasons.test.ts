import { describe, it, expect } from 'vitest';
import type { DiscardReason, DiscardReasonCode } from '@browser-games/engine-mahjong-analysis';
import { renderReason, renderReasons } from './reasons.ts';

function reason(code: DiscardReasonCode, value: number): DiscardReason {
  return { code, value, contribution: 0 };
}

describe('renderReason', () => {
  it.each([
    [reason('completion-distance', 2), 'Keeps the hand 2 steps from a win.'],
    [reason('completion-distance', 1), 'Keeps the hand 1 step from a win.'],
    [reason('improving-tiles', 3), '3 tile kinds improve the hand.'],
    [reason('improving-tiles', 1), '1 tile kind improve the hand.'],
    [reason('good-shapes', 4), 'The remaining tiles form 4 good shapes.'],
    [reason('good-shapes', 1), 'The remaining tiles form 1 good shape.'],
    [reason('wait-count', 2), 'The hand waits on 2 tiles.'],
    [reason('isolated-penalty', 6), 'Isolated tiles add a penalty of 6.'],
  ])('renders %o as a sentence', (input, expected) => {
    expect(renderReason(input)).toBe(expected);
  });

  it('returns null for an unknown reason code', () => {
    const unknown = reason('mystery' as DiscardReasonCode, 1);
    expect(renderReason(unknown)).toBeNull();
  });
});

describe('renderReasons', () => {
  it('drops reasons that cannot be rendered instead of inventing text', () => {
    const reasons = [
      reason('improving-tiles', 2),
      reason('mystery' as DiscardReasonCode, 9),
      reason('wait-count', 1),
    ];
    expect(renderReasons(reasons)).toEqual([
      '2 tile kinds improve the hand.',
      'The hand waits on 1 tile.',
    ]);
  });
});
