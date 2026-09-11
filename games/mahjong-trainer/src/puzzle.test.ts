import { describe, it, expect } from 'vitest';
import type { Tile, TileKind } from '@browser-games/engine-mahjong';
import type { RankedDiscard } from '@browser-games/engine-mahjong-analysis';
import {
  MEANINGFUL_SPREAD_THRESHOLD,
  generatePuzzle,
  isMeaningfulSpread,
  rankingSpread,
} from './puzzle.ts';

const PLACEHOLDER_TILE: Tile = { id: 'honor-east-1', suit: 'honor', honor: 'east' };

function ranked(kind: TileKind, score: number): RankedDiscard {
  return {
    tile: PLACEHOLDER_TILE,
    kind,
    score,
    completionDistance: 0,
    improvingTileKinds: [],
    improvementCount: 0,
    shapeMetrics: { shapeQuality: 0, isolatedTilePenalty: 0, shapes: [] },
    waitQuality: 0,
    reasons: [],
  };
}

describe('rankingSpread', () => {
  it('returns the best minus worst score', () => {
    const ranking = [ranked('1m', 100), ranked('2m', 40), ranked('east', -30)];
    expect(rankingSpread(ranking)).toBe(130);
  });

  it('returns 0 for an empty ranking', () => {
    expect(rankingSpread([])).toBe(0);
  });
});

describe('isMeaningfulSpread', () => {
  it('rejects a flat ranking', () => {
    const flat = [ranked('1m', 10), ranked('2m', 10), ranked('3m', 10)];
    expect(rankingSpread(flat)).toBe(0);
    expect(isMeaningfulSpread(flat)).toBe(false);
  });

  it('rejects a spread at the threshold', () => {
    const ranking = [ranked('1m', MEANINGFUL_SPREAD_THRESHOLD), ranked('2m', 0)];
    expect(isMeaningfulSpread(ranking)).toBe(false);
  });

  it('accepts a clear spread beyond the threshold', () => {
    const ranking = [ranked('1m', MEANINGFUL_SPREAD_THRESHOLD + 1), ranked('2m', 0)];
    expect(isMeaningfulSpread(ranking)).toBe(true);
  });
});

describe('generatePuzzle', () => {
  it('reproduces the same puzzle from the same seed', () => {
    expect(generatePuzzle(1)).toEqual(generatePuzzle(1));
  });

  it('produces a hand and a ranking with a meaningful spread', () => {
    const puzzle = generatePuzzle(1);
    expect(puzzle.hand.length).toBeGreaterThan(0);
    expect(puzzle.ranking.length).toBeGreaterThan(0);
    expect(puzzle.spread).toBeGreaterThan(MEANINGFUL_SPREAD_THRESHOLD);
    expect(isMeaningfulSpread(puzzle.ranking)).toBe(true);
  });

  it('records the seed that produced the accepted puzzle', () => {
    const puzzle = generatePuzzle(1);
    expect(generatePuzzle(puzzle.seed).hand).toEqual(puzzle.hand);
  });
});
