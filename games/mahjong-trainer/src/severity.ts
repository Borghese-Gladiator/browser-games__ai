import type { Tile } from '@browser-games/engine-mahjong';
import { tileToKind } from '@browser-games/engine-mahjong';
import type { RankedDiscard } from '@browser-games/engine-mahjong-analysis';
import { type MistakeSeverity, SEVERITY_THRESHOLDS, severityForDelta } from '@portal/shared/severity';
import type { DiscardTrainerPuzzle } from './puzzle.ts';

// Severity classification now lives in @portal/shared so the trainer and the
// post-game review grade discards identically. Re-export it so existing trainer
// imports keep working.
export { type MistakeSeverity, SEVERITY_THRESHOLDS, severityForDelta };

export interface PlayerChoiceResult {
  readonly choice: Tile;
  readonly choiceRank: number;
  readonly best: RankedDiscard;
  readonly deltaScore: number;
  readonly severity: MistakeSeverity;
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
