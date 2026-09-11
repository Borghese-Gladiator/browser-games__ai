import type { SettlementRule } from '../scoring/settlement.ts';

export interface TaiwaneseRules {
  playerCount: number;
  concealedHandSize: number;
  flowersEnabled: boolean;
  minimumTai: number;
  dealerRepeatsOnWin: boolean;
  sevenPairsEnabled: boolean;
  startingScore: number;
  settlement?: SettlementRule;
}

export const DEFAULT_TAIWANESE_RULES: TaiwaneseRules = {
  playerCount: 4,
  concealedHandSize: 16,
  flowersEnabled: true,
  minimumTai: 0,
  dealerRepeatsOnWin: true,
  sevenPairsEnabled: true,
  startingScore: 500,
};

export function winningHandSize(rules: TaiwaneseRules): number {
  return rules.concealedHandSize + 1;
}
