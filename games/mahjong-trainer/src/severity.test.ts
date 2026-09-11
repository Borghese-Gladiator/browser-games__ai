import { describe, it, expect } from 'vitest';
import type { Tile, TileKind } from '@browser-games/engine-mahjong';
import type { RankedDiscard } from '@browser-games/engine-mahjong-analysis';
import type { DiscardTrainerPuzzle } from './puzzle.ts';
import { type MistakeSeverity, SEVERITY_THRESHOLDS, scoreChoice, severityForDelta } from './severity.ts';

const honorTile: Tile = { id: 'honor-east-1', suit: 'honor', honor: 'east' };
const numberTile: Tile = { id: 'characters-3-1', suit: 'characters', rank: 3 };

function ranked(kind: TileKind, score: number): RankedDiscard {
  return {
    tile: honorTile,
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

const ranking = [ranked('east', 100), ranked('3m', 80)];
const puzzle: DiscardTrainerPuzzle = {
  seed: 1,
  hand: [honorTile, numberTile],
  ranking,
  spread: ranking[0].score - ranking[ranking.length - 1].score,
};

describe('severityForDelta', () => {
  it.each<[number, MistakeSeverity]>([
    [0, 'optimal'],
    [SEVERITY_THRESHOLDS.minor - 1, 'optimal'],
    [SEVERITY_THRESHOLDS.minor, 'minor'],
    [SEVERITY_THRESHOLDS.moderate - 1, 'minor'],
    [SEVERITY_THRESHOLDS.moderate, 'moderate'],
    [SEVERITY_THRESHOLDS.severe - 1, 'moderate'],
    [SEVERITY_THRESHOLDS.severe, 'severe'],
    [SEVERITY_THRESHOLDS.severe + 500, 'severe'],
  ])('maps delta %d to %s', (delta, expected) => {
    expect(severityForDelta(delta)).toBe(expected);
  });
});

describe('scoreChoice', () => {
  it('grades the best option as optimal with a zero delta', () => {
    const result = scoreChoice(puzzle, honorTile);
    expect(result.choiceRank).toBe(1);
    expect(result.best).toBe(puzzle.ranking[0]);
    expect(result.deltaScore).toBe(0);
    expect(result.severity).toBe('optimal');
  });

  it('scores a worse choice as best minus chosen', () => {
    const result = scoreChoice(puzzle, numberTile);
    expect(result.choiceRank).toBe(2);
    expect(result.deltaScore).toBe(20);
    expect(result.severity).toBe('moderate');
  });

  it('throws when the tile is not a ranked discard', () => {
    const foreign: Tile = { id: 'bamboo-9-1', suit: 'bamboo', rank: 9 };
    expect(() => scoreChoice(puzzle, foreign)).toThrow();
  });
});
