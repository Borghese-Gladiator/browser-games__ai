import type { Tile } from '@browser-games/engine-mahjong';
import { tileToKind } from '@browser-games/engine-mahjong';
import type { RankedDiscard } from '@browser-games/engine-mahjong-analysis';
import type { DiscardTrainerPuzzle } from './puzzle.ts';

export type MistakeSeverity = 'optimal' | 'minor' | 'moderate' | 'severe';

export const SEVERITY_THRESHOLDS: Readonly<{ minor: number; moderate: number; severe: number }> = {
  minor: 1,
  moderate: 20,
  severe: 1000,
};

export interface PlayerChoiceResult {
  readonly choice: Tile;
  readonly choiceRank: number;
  readonly best: RankedDiscard;
  readonly deltaScore: number;
  readonly severity: MistakeSeverity;
}

export function severityForDelta(deltaScore: number): MistakeSeverity {
  if (deltaScore < SEVERITY_THRESHOLDS.minor) {
    return 'optimal';
  }
  if (deltaScore < SEVERITY_THRESHOLDS.moderate) {
    return 'minor';
  }
  if (deltaScore < SEVERITY_THRESHOLDS.severe) {
    return 'moderate';
  }
  return 'severe';
}

export function scoreChoice(puzzle: DiscardTrainerPuzzle, choice: Tile): PlayerChoiceResult {
  const kind = tileToKind(choice);
  const index = puzzle.ranking.findIndex((entry) => entry.kind === kind);
  if (index === -1) {
    throw new Error(`tile ${choice.id} is not a ranked discard in this puzzle`);
  }
  const chosen = puzzle.ranking[index];
  const best = puzzle.ranking[0];
  const deltaScore = best.score - chosen.score;
  return {
    choice,
    choiceRank: index + 1,
    best,
    deltaScore,
    severity: severityForDelta(deltaScore),
  };
}
