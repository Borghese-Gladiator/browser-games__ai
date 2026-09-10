export type Wind = 'east' | 'south' | 'west' | 'north';

export type Tier = 'guaranteed' | 'on-track' | 'potential';

export type MeldType = 'pong' | 'kong' | 'chow' | 'pair';

export interface Meld {
  tiles: string[];
  type: MeldType;
  concealed: boolean;
}

export interface TaiPatternDef {
  id: string;
  english: string;
  chinese: string;
  tai: number;
  rule: string;
}

export interface Ruleset {
  taiValues: Record<string, TaiPatternDef>;
  maxTilesInHand: number;
}

export interface Position {
  concealedTiles: string[];
  exposedMelds: Meld[];
  flowers: string[];
  seatWind: Wind;
  roundWind: Wind;
  isDealer: boolean;
  ruleset: Ruleset;
}

export interface WinningHand {
  tiles: string[];
  melds: Meld[];
}

export interface EstimatedPattern {
  id: string;
  english: string;
  chinese: string;
  tai: number;
  rule: string;
  tier: Tier;
}

export interface TaiEstimate {
  guaranteed: EstimatedPattern[];
  onTrack: EstimatedPattern[];
  potential: EstimatedPattern[];
  totals: {
    guaranteed: number;
    onTrack: number;
    potential: number;
  };
}
