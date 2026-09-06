export interface TaiwaneseRules {
  playerCount: number;
  concealedHandSize: number;
  flowersEnabled: boolean;
  minimumTai: number;
  dealerRepeatsOnWin: boolean;
  sevenPairsEnabled: boolean;
}

export const DEFAULT_TAIWANESE_RULES: TaiwaneseRules = {
  playerCount: 4,
  concealedHandSize: 16,
  flowersEnabled: true,
  minimumTai: 0,
  dealerRepeatsOnWin: true,
  sevenPairsEnabled: true,
};
