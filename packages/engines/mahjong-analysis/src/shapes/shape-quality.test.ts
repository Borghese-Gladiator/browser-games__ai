import { describe, it, expect } from 'vitest';
import { tiles } from '../test-helpers.ts';
import { countsFromTiles } from '../completion/distance.ts';
import { shapeMetrics } from './shape-quality.ts';

describe('shapeMetrics', () => {
  it('scores good shapes and penalizes an isolated honor', () => {
    const metrics = shapeMetrics(countsFromTiles(tiles('1m 1m 2m 3m 5m 7m east')));
    expect(metrics.shapeQuality).toBe(3);
    expect(metrics.isolatedTilePenalty).toBe(6);
  });

  it('penalizes an isolated number tile less than an isolated honor', () => {
    const numberPenalty = shapeMetrics(countsFromTiles(tiles('1m 5s 9p'))).isolatedTilePenalty;
    const honorPenalty = shapeMetrics(countsFromTiles(tiles('east south west'))).isolatedTilePenalty;
    expect(numberPenalty).toBeLessThan(honorPenalty);
  });
});
