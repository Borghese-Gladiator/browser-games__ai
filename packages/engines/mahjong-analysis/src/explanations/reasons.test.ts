import { describe, it, expect } from 'vitest';
import { buildDiscardReasons } from './reasons.ts';

describe('buildDiscardReasons', () => {
  it('maps metrics to reason codes, values, and contributions', () => {
    const reasons = buildDiscardReasons({
      tile: { id: 'east-1', suit: 'honor', honor: 'east' },
      kind: 'east',
      completionDistance: 2,
      improvingTileKinds: ['1m', '2m'],
      improvementCount: 2,
      shapeMetrics: { shapeQuality: 3, isolatedTilePenalty: 6, shapes: [] },
      waitQuality: 0,
    });
    expect(reasons).toEqual([
      { code: 'completion-distance', value: 2, contribution: -2000 },
      { code: 'improving-tiles', value: 2, contribution: 40 },
      { code: 'good-shapes', value: 3, contribution: 30 },
      { code: 'wait-count', value: 0, contribution: 0 },
      { code: 'isolated-penalty', value: 6, contribution: -6 },
    ]);
  });
});
