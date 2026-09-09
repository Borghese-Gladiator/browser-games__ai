import type { DiscardPosition } from '../completion/distance.ts';
import type { DiscardAnalysis } from './analyze-discard.ts';
import { analyzeDiscardOptions } from './analyze-discard.ts';

export interface RankedDiscard extends DiscardAnalysis {
  readonly score: number;
}

function scoreAnalysis(analysis: DiscardAnalysis): number {
  return analysis.reasons.reduce((total, reason) => total + reason.contribution, 0);
}

export function rankDiscards(position: DiscardPosition): readonly RankedDiscard[] {
  const ranked: RankedDiscard[] = analyzeDiscardOptions(position).map((analysis) => ({
    ...analysis,
    score: scoreAnalysis(analysis),
  }));
  ranked.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind));
  return ranked;
}
